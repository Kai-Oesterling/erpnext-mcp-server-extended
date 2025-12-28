# ERPNext MCP Server Extended

Extended MCP (Model Context Protocol) Server for ERPNext with additional tools for workflow management, custom fields, and DocType creation.

This is a fork of [rakeshgangwar/erpnext-mcp-server](https://github.com/rakeshgangwar/erpnext-mcp-server) with significant extensions for advanced ERPNext automation.

## Features

### Core Tools (from original)
- `authenticate_erpnext` - Authenticate with ERPNext
- `get_documents` - List documents with filtering
- `get_document` - Get single document
- `create_document` - Create new document
- `update_document` - Update existing document
- `get_doctypes` - List all DocTypes
- `get_doctype_fields` - Get field definitions
- `run_report` - Execute ERPNext reports

### Extended Tools (new)
| Tool | Description |
|------|-------------|
| `delete_document` | Delete a document from ERPNext |
| `submit_document` | Submit a document (Draft → Submitted) |
| `cancel_document` | Cancel a submitted document |
| `get_doctype_meta` | Get complete DocType metadata including permissions |
| `create_doctype` | Create new custom DocTypes |
| `add_doctype_field` | Add fields to existing DocTypes |
| `get_workflow` | Get active workflow for a DocType |
| `create_workflow` | Create new workflows with states and transitions |
| `update_workflow` | Modify existing workflows |
| `create_custom_field` | Add custom fields (survives ERPNext updates) |
| `create_property_setter` | Override DocType/field properties |

## Installation

```bash
git clone https://github.com/Kai-Oesterling/erpnext-mcp-server-extended.git
cd erpnext-mcp-server-extended
npm install
npm run build
```

## Configuration

### Claude Desktop - Complete MCP Setup

Below is a complete example configuration for Claude Desktop with multiple MCP servers including ERPNext, GitHub, Nextcloud, Metabase, and MSSQL.

Add to your Claude Desktop configuration (`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      }
    },
    "mssql": {
      "command": "npx",
      "args": ["-y", "mssql-mcp@latest"],
      "env": {
        "DB_SERVER": "localhost",
        "DB_DATABASE": "YourDatabase",
        "DB_USER": "sa",
        "DB_PASSWORD": "YourPassword",
        "DB_TRUST_SERVER_CERTIFICATE": "true"
      }
    },
    "erpnext": {
      "command": "node",
      "args": ["C:\\path\\to\\erpnext-mcp-server-extended\\build\\index.js"],
      "env": {
        "ERPNEXT_URL": "https://your-erpnext-instance.com",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    },
    "metabase": {
      "command": "npx",
      "args": ["@cognitionai/metabase-mcp-server"],
      "env": {
        "METABASE_URL": "http://your-metabase-server:3000",
        "METABASE_API_KEY": "your-metabase-api-key"
      }
    },
    "nextcloud": {
      "command": "node",
      "args": ["C:\\path\\to\\nextcloud-mcp\\dist\\cli.js"],
      "env": {
        "NEXTCLOUD_HOST": "https://your-nextcloud-instance.com",
        "NEXTCLOUD_USERNAME": "admin",
        "NEXTCLOUD_PASSWORD": "your-password"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ERPNEXT_URL` | Your ERPNext instance URL |
| `ERPNEXT_API_KEY` | API Key (from User settings in ERPNext) |
| `ERPNEXT_API_SECRET` | API Secret |

### GitHub MCP Server Setup

The GitHub MCP Server allows Claude to directly manage your GitHub repositories, create issues, push code, and more.

**Prerequisites:**
- Docker Desktop installed and running
- GitHub Personal Access Token with `repo`, `workflow`, and `read:org` permissions

**Setup:**
1. Pull the Docker image: `docker pull ghcr.io/github/github-mcp-server`
2. Create a GitHub PAT at https://github.com/settings/tokens
3. Add the configuration to your `claude_desktop_config.json`
4. Restart Claude Desktop

**Tip:** Set Docker Desktop to start automatically with Windows for seamless integration.

## Usage Examples

### Create a Custom DocType

```
Create a DocType called "Project Task" with fields:
- task_name (Data, required)
- status (Select: Open/In Progress/Completed)
- assigned_to (Link to User)
- due_date (Date)
```

### Create a Workflow

```
Create an approval workflow for Sales Order:
- Draft → Pending Approval (Submit action, Sales User)
- Pending Approval → Approved (Approve action, Sales Manager)
- Pending Approval → Rejected (Reject action, Sales Manager)
```

### Add Custom Field

```
Add a custom field "priority" (Select: Low/Medium/High) to the Customer DocType
```

### GitHub Integration

With the GitHub MCP Server configured, Claude can:
- Create and manage repositories
- Push code and create files
- Create issues and pull requests
- Manage branches and releases

## Related MCP Servers

This setup works well with other MCP servers:

| Server | Purpose | Repository |
|--------|---------|------------|
| GitHub MCP | Repository management, code push, issues | [github/github-mcp-server](https://github.com/github/github-mcp-server) |
| Nextcloud MCP | File storage, calendar, contacts | Community |
| Metabase MCP | Business intelligence, dashboards | [@cognitionai/metabase-mcp-server](https://www.npmjs.com/package/@cognitionai/metabase-mcp-server) |
| MSSQL MCP | SQL Server database access | [mssql-mcp](https://www.npmjs.com/package/mssql-mcp) |

## License

MIT License - see [LICENSE](LICENSE) file.

## Credits

- Original MCP Server: [rakeshgangwar/erpnext-mcp-server](https://github.com/rakeshgangwar/erpnext-mcp-server)
- Extended by: [SVAN GmbH](https://svan.gmbh)
