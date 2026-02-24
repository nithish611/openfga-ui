import type { AuthorizationModel, TypeDefinition, Userset } from '../types/openfga';

interface ParsedRelation {
  name: string;
  definition: string;
  directTypes: string[];
}

interface ParsedType {
  name: string;
  relations: ParsedRelation[];
}

interface ParsedCondition {
  name: string;
  params: string;
  expression: string;
}

interface ParseResult {
  schemaVersion: string;
  types: ParsedType[];
  conditions: ParsedCondition[];
}

/**
 * Parse OpenFGA DSL format into JSON model
 */
export function parseDSL(dsl: string): Omit<AuthorizationModel, 'id'> {
  const lines = dsl.split('\n');
  const result: ParseResult = {
    schemaVersion: '1.1',
    types: [],
    conditions: [],
  };

  let currentType: ParsedType | null = null;
  let inRelations = false;
  let inCondition = false;
  let currentCondition: ParsedCondition | null = null;
  let conditionBody: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    // Parse model declaration
    if (trimmed === 'model') {
      continue;
    }

    // Parse schema version
    const schemaMatch = trimmed.match(/^schema\s+(\d+\.\d+)$/);
    if (schemaMatch) {
      result.schemaVersion = schemaMatch[1];
      continue;
    }

    // Parse type declaration
    const typeMatch = trimmed.match(/^type\s+(\w+)$/);
    if (typeMatch) {
      if (currentType) {
        result.types.push(currentType);
      }
      currentType = { name: typeMatch[1], relations: [] };
      inRelations = false;
      continue;
    }

    // Parse relations section
    if (trimmed === 'relations') {
      inRelations = true;
      continue;
    }

    // Parse relation definition
    const defineMatch = trimmed.match(/^define\s+(\w+)\s*:\s*(.+)$/);
    if (defineMatch && currentType && inRelations) {
      const relationName = defineMatch[1];
      const definition = defineMatch[2].trim();
      
      // Extract direct types from brackets like [user, user:*, group#member]
      const directTypes: string[] = [];
      const bracketMatch = definition.match(/\[([^\]]+)\]/);
      if (bracketMatch) {
        const types = bracketMatch[1].split(',').map(t => t.trim());
        directTypes.push(...types);
      }

      currentType.relations.push({
        name: relationName,
        definition,
        directTypes,
      });
      continue;
    }

    // Parse condition declaration
    const conditionMatch = trimmed.match(/^condition\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/);
    if (conditionMatch) {
      if (currentType) {
        result.types.push(currentType);
        currentType = null;
      }
      inCondition = true;
      currentCondition = {
        name: conditionMatch[1],
        params: conditionMatch[2],
        expression: '',
      };
      conditionBody = [];
      continue;
    }

    // Parse condition body
    if (inCondition && currentCondition) {
      if (trimmed === '}') {
        currentCondition.expression = conditionBody.join('\n').trim();
        result.conditions.push(currentCondition);
        currentCondition = null;
        inCondition = false;
        conditionBody = [];
      } else {
        conditionBody.push(trimmed);
      }
      continue;
    }
  }

  // Don't forget the last type
  if (currentType) {
    result.types.push(currentType);
  }

  // Convert to OpenFGA JSON format
  return convertToJSON(result);
}

function convertToJSON(parsed: ParseResult): Omit<AuthorizationModel, 'id'> {
  const typeDefinitions: TypeDefinition[] = parsed.types.map(type => {
    const typeDef: TypeDefinition = {
      type: type.name,
    };

    if (type.relations.length > 0) {
      typeDef.relations = {};
      typeDef.metadata = { relations: {} };

      for (const rel of type.relations) {
        typeDef.relations[rel.name] = parseRelationDefinition(rel.definition);
        
        if (rel.directTypes.length > 0) {
          typeDef.metadata!.relations![rel.name] = {
            directly_related_user_types: rel.directTypes.map(parseTypeReference),
          };
        }
      }
    }

    return typeDef;
  });

  const model: Omit<AuthorizationModel, 'id'> = {
    schema_version: parsed.schemaVersion,
    type_definitions: typeDefinitions,
  };

  if (parsed.conditions.length > 0) {
    model.conditions = {};
    for (const cond of parsed.conditions) {
      model.conditions[cond.name] = {
        name: cond.name,
        expression: cond.expression,
        parameters: parseConditionParams(cond.params),
      };
    }
  }

  return model;
}

function parseTypeReference(typeStr: string): { type: string; relation?: string; wildcard?: Record<string, never>; condition?: string } {
  const trimmed = typeStr.trim();
  
  // Handle wildcard: user:*
  if (trimmed.endsWith(':*')) {
    return { type: trimmed.slice(0, -2), wildcard: {} };
  }
  
  // Handle relation reference: group#member
  const hashMatch = trimmed.match(/^(\w+)#(\w+)$/);
  if (hashMatch) {
    return { type: hashMatch[1], relation: hashMatch[2] };
  }
  
  // Handle condition: user with condition
  const condMatch = trimmed.match(/^(\w+)\s+with\s+(\w+)$/);
  if (condMatch) {
    return { type: condMatch[1], condition: condMatch[2] };
  }
  
  // Simple type
  return { type: trimmed };
}

function parseRelationDefinition(definition: string): Userset {
  const trimmed = definition.trim();

  // Handle direct assignment: [user] or [user, group#member]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return { this: {} };
  }

  // Handle union: [user] or owner
  if (trimmed.includes(' or ')) {
    const parts = splitByOperator(trimmed, ' or ');
    return {
      union: {
        child: parts.map(p => parseRelationDefinition(p)),
      },
    };
  }

  // Handle intersection: owner and editor
  if (trimmed.includes(' and ')) {
    const parts = splitByOperator(trimmed, ' and ');
    return {
      intersection: {
        child: parts.map(p => parseRelationDefinition(p)),
      },
    };
  }

  // Handle difference: viewer but not blocked
  if (trimmed.includes(' but not ')) {
    const parts = trimmed.split(' but not ');
    return {
      difference: {
        base: parseRelationDefinition(parts[0]),
        subtract: parseRelationDefinition(parts[1]),
      },
    };
  }

  // Handle tuple to userset: parent->viewer
  if (trimmed.includes('->')) {
    const parts = trimmed.split('->');
    return {
      tupleToUserset: {
        tupleset: { relation: parts[0].trim() },
        computedUserset: { relation: parts[1].trim() },
      },
    };
  }

  // Handle computed userset (just a relation name)
  if (/^\w+$/.test(trimmed)) {
    return {
      computedUserset: { relation: trimmed },
    };
  }

  // Handle direct with types in brackets at the start
  const bracketMatch = trimmed.match(/^\[([^\]]+)\](.*)$/);
  if (bracketMatch) {
    const rest = bracketMatch[2].trim();
    if (!rest) {
      return { this: {} };
    }
    // [user] or owner
    if (rest.startsWith('or ')) {
      const otherPart = rest.slice(3).trim();
      return {
        union: {
          child: [
            { this: {} },
            parseRelationDefinition(otherPart),
          ],
        },
      };
    }
  }

  // Default to this (direct)
  return { this: {} };
}

function splitByOperator(str: string, operator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let i = 0;

  while (i < str.length) {
    if (str[i] === '[') {
      bracketDepth++;
      current += str[i];
    } else if (str[i] === ']') {
      bracketDepth--;
      current += str[i];
    } else if (bracketDepth === 0 && str.slice(i).startsWith(operator)) {
      parts.push(current.trim());
      current = '';
      i += operator.length;
      continue;
    } else {
      current += str[i];
    }
    i++;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseConditionParams(params: string): Record<string, { type_name: string }> | undefined {
  if (!params.trim()) return undefined;
  
  const result: Record<string, { type_name: string }> = {};
  const pairs = params.split(',');
  
  for (const pair of pairs) {
    const match = pair.trim().match(/^(\w+)\s*:\s*(\w+)$/);
    if (match) {
      result[match[1]] = { type_name: match[2] };
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Convert JSON model to DSL format for editing
 */
export function modelToDSLForEdit(model: AuthorizationModel): string {
  const lines: string[] = [];
  lines.push('model');
  lines.push(`  schema ${model.schema_version}`);
  lines.push('');

  for (const typeDef of model.type_definitions) {
    lines.push(`type ${typeDef.type}`);
    
    if (typeDef.relations && Object.keys(typeDef.relations).length > 0) {
      lines.push('  relations');
      
      for (const [relationName, userset] of Object.entries(typeDef.relations)) {
        const directTypes = typeDef.metadata?.relations?.[relationName]?.directly_related_user_types || [];
        const definition = buildRelationDefinition(userset, directTypes);
        lines.push(`    define ${relationName}: ${definition}`);
      }
    }
    lines.push('');
  }

  if (model.conditions) {
    for (const [condName, condition] of Object.entries(model.conditions)) {
      const params = formatConditionParams(condition.parameters);
      lines.push(`condition ${condName}(${params}) {`);
      lines.push(`  ${condition.expression}`);
      lines.push('}');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildRelationDefinition(
  userset: Userset, 
  directTypes: Array<{ type: string; relation?: string; wildcard?: Record<string, never>; condition?: string }>
): string {
  const typeStr = directTypes.length > 0 
    ? `[${directTypes.map(formatTypeRef).join(', ')}]` 
    : '';

  if (userset.this) {
    return typeStr || '[user]';
  }

  if (userset.computedUserset) {
    return userset.computedUserset.relation || '';
  }

  if (userset.tupleToUserset) {
    const tupleset = userset.tupleToUserset.tupleset?.relation || '';
    const computed = userset.tupleToUserset.computedUserset?.relation || '';
    return `${tupleset}->${computed}`;
  }

  if (userset.union) {
    const children = userset.union.child || [];
    const parts = children.map((c, idx) => {
      if (c.this && idx === 0 && typeStr) {
        return typeStr;
      }
      return buildRelationDefinition(c, []);
    });
    return parts.join(' or ');
  }

  if (userset.intersection) {
    const children = userset.intersection.child || [];
    return children.map(c => buildRelationDefinition(c, [])).join(' and ');
  }

  if (userset.difference) {
    const base = buildRelationDefinition(userset.difference.base || {}, []);
    const subtract = buildRelationDefinition(userset.difference.subtract || {}, []);
    return `${base} but not ${subtract}`;
  }

  return typeStr || '[user]';
}

function formatTypeRef(ref: { type: string; relation?: string; wildcard?: Record<string, never>; condition?: string }): string {
  if (ref.wildcard) {
    return `${ref.type}:*`;
  }
  if (ref.relation) {
    return `${ref.type}#${ref.relation}`;
  }
  if (ref.condition) {
    return `${ref.type} with ${ref.condition}`;
  }
  return ref.type;
}

function formatConditionParams(params?: Record<string, { type_name: string }>): string {
  if (!params) return '';
  return Object.entries(params)
    .map(([name, type]) => `${name}: ${type.type_name}`)
    .join(', ');
}
