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

### Claude Desktop

Add to your Claude Desktop configuration (`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "node",
      "args": ["C:/path/to/erpnext-mcp-server-extended/build/index.js"],
      "env": {
        "ERPNEXT_URL": "https://your-erpnext-instance.com",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
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

## License

MIT License - see [LICENSE](LICENSE) file.

## Credits

- Original MCP Server: [rakeshgangwar/erpnext-mcp-server](https://github.com/rakeshgangwar/erpnext-mcp-server)
- Extended by: [SVAN GmbH](https://svan.gmbh)
