# OpenFGA UI

A modern, feature-rich web interface for [OpenFGA](https://openfga.dev) — the open-source Fine-Grained Authorization system. Explore authorization models, manage relationship tuples, run queries, and visualize access relationships all from your browser.

**[Live Demo](https://openfga-ui.vercel.app/)**

---

## Features

### Server Connection
- Connect to any OpenFGA server instance
- **Three authentication methods**: No auth, Pre-shared Key, and OIDC (client credentials flow)
- Connection status indicator with auto-reconnect

### Authorization Model Management
- View models in **Visual**, **DSL**, or **JSON** formats
- Edit models with a DSL editor featuring live syntax validation
- Create new models from built-in templates
- Browse model version history
- Syntax highlighting for both DSL and JSON

### Relationship Tuples
- Full CRUD operations on relationship tuples
- Real-time client-side filtering by user, relation, or object
- Infinite scroll pagination for large datasets
- Tuple detail side panel with one-click copy
- Export tuples as JSON

### Query Operations
- **Check** — Verify if a user has a relationship with an object
- **Expand** — See all users who have access to an object
- **List Objects** — Find all objects a user can access
- **List Users** — Find all users with access to an object
- Context support for conditional authorization on all query types

### Saved Queries
- Save and reuse frequently run queries
- Run saved queries individually or in bulk
- Import/export query collections as JSON
- Expected result validation for Check queries
- Drag-and-drop reordering

### Relationship Visualization
- Interactive graph powered by **ReactFlow**
- Filter by type and relation
- Vertical and horizontal layout modes
- Color-coded nodes by entity type
- Automatic layout with the Dagre algorithm

### Store Management
- List, create, and switch between stores
- Searchable store dropdown with infinite scroll pagination
- Store metadata display (ID, created/updated timestamps)

### UI/UX
- Dark mode
- Collapsible sidebar
- Copy-to-clipboard throughout
- Loading states and error handling
- Responsive design

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Graph Visualization | ReactFlow + Dagre |
| UI Components | Headless UI + Heroicons |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- A running [OpenFGA server](https://openfga.dev/docs/getting-started/setup-openfga/overview)

### Installation

```bash
git clone https://github.com/nithish611/openfga-ui.git
cd openfga-ui
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

---

## Deployment

### Vercel (Recommended)

The project includes a GitHub Actions workflow that automatically deploys to Vercel on every push to `master`.

**Setup:**

1. Create a [Vercel API Token](https://vercel.com/account/tokens)
2. Add these secrets to your GitHub repo (**Settings > Secrets and variables > Actions**):

   | Secret | Description |
   |---|---|
   | `VERCEL_TOKEN` | Your Vercel API token |
   | `VERCEL_ORG_ID` | Your Vercel team/org ID |
   | `VERCEL_PROJECT_ID` | Your Vercel project ID |

3. Push to `master` — the deployment runs automatically.

### Manual Deploy

```bash
npm install -g vercel
vercel --prod
```

---

## Connecting to OpenFGA

1. Open the app and enter your **OpenFGA Server URL** (e.g. `http://localhost:8080`)
2. Select an authentication method:
   - **None** — No authentication required
   - **Pre-shared Key** — Enter the token configured via `OPENFGA_AUTHN_PRESHARED_KEYS`
   - **OIDC** — Provide token endpoint, client ID, and client secret
3. Click **Connect** — your stores will load automatically

---

## License

MIT
