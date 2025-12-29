# ERPNext MCP Server Extended

Extended MCP (Model Context Protocol) Server for ERPNext with:

- **🔧 Improved Error Handling** - Returns detailed ERPNext error messages instead of generic failures
- **📋 Workflow Management** - Create and manage approval workflows
- **🔗 Custom Fields** - Add custom fields that survive ERPNext updates
- **📦 DocType Creation** - Create new DocTypes programmatically
- **🔄 Document Lifecycle** - Submit, cancel, and delete documents

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/Kai-Oesterling/erpnext-mcp-server-extended.git
cd erpnext-mcp-server-extended
npm install
npm run build
```

### Configuration

Set environment variables:

```bash
export ERPNEXT_URL="https://your-erpnext-instance.com"
export ERPNEXT_API_KEY="your-api-key"
export ERPNEXT_API_SECRET="your-api-secret"
export ERPNEXT_DEBUG="true"  # Optional: Enable debug logging
```

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "node",
      "args": ["C:\\path\\to\\erpnext-mcp-server-extended\\build\\index.js"],
      "env": {
        "ERPNEXT_URL": "https://your-erpnext-instance.com",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

## 🔧 Improved Error Handling

### Before (Original)
```
Tool execution failed
```
or
```
Failed to create Fiscal Year: Request failed with status code 417
```

### After (Extended)
```
Failed to create Fiscal Year (HTTP 417): ValidationError: Companies is required for Fiscal Year
```

The extended server extracts detailed error information from:
- `_server_messages` - JSON-encoded array of server messages
- `exception` - Python exception details
- `exc_type` - Exception type (ValidationError, MandatoryError, etc.)
- `message` - Human-readable error message

## 📚 Available Tools

### Core Operations
| Tool | Description |
|------|-------------|
| `authenticate_erpnext` | Authenticate with username/password |
| `get_documents` | List documents with filtering |
| `get_document` | Get single document |
| `create_document` | Create new document |
| `update_document` | Update existing document |
| `delete_document` | Delete a document |

### Document Lifecycle
| Tool | Description |
|------|-------------|
| `submit_document` | Submit document (Draft → Submitted) |
| `cancel_document` | Cancel submitted document |

### DocType Operations
| Tool | Description |
|------|-------------|
| `get_doctypes` | List all DocTypes |
| `get_doctype_fields` | Get field definitions |
| `get_doctype_meta` | Get complete metadata |
| `create_doctype` | Create new DocType |
| `add_doctype_field` | Add field to DocType |

### Workflow Management
| Tool | Description |
|------|-------------|
| `get_workflow` | Get active workflow for DocType |
| `create_workflow` | Create new workflow |
| `update_workflow` | Modify existing workflow |

### Customization
| Tool | Description |
|------|-------------|
| `create_custom_field` | Add custom field (survives updates) |
| `create_property_setter` | Override DocType/field properties |

### Reports
| Tool | Description |
|------|-------------|
| `run_report` | Execute ERPNext report |

## 💡 Usage Examples

### Create a Document
```
Create a new Customer named "ACME Corp" with customer_group "Commercial"
```

### Create a Workflow
```
Create an approval workflow for Purchase Order:
- Draft → Pending Approval (Submit action, Purchase User)
- Pending Approval → Approved (Approve action, Purchase Manager)  
- Pending Approval → Rejected (Reject action, Purchase Manager)
```

### Add Custom Field
```
Add a custom field "priority" (Select: Low/Medium/High) to the Customer DocType
```

### Create DocType
```
Create a DocType called "Project Task" with fields:
- task_name (Data, required)
- status (Select: Open/In Progress/Completed)
- assigned_to (Link to User)
- due_date (Date)
```

## 🐛 Debug Mode

Enable debug mode to see detailed API requests and responses:

```bash
export ERPNEXT_DEBUG=true
```

This will log:
- All API requests with URLs and parameters
- All API responses with status codes and data
- Detailed error information

## 🔐 Authentication

### Option 1: API Key (Recommended)
Set `ERPNEXT_API_KEY` and `ERPNEXT_API_SECRET` environment variables.

Generate API keys in ERPNext:
1. Go to User settings
2. Click "API Access"
3. Generate new keys

### Option 2: Username/Password
Use the `authenticate_erpnext` tool at runtime:
```
Authenticate with ERPNext using username "admin" and password "..."
```

## 📦 ERPNext API Key Setup

1. Login to ERPNext as Administrator
2. Go to **Settings → User**
3. Select your user
4. Scroll to **API Access** section
5. Click **Generate Keys**
6. Copy the API Key and API Secret

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## 🙏 Credits

- Original MCP Server: [rakeshgangwar/erpnext-mcp-server](https://github.com/rakeshgangwar/erpnext-mcp-server)
- Extended by: [SVAN GmbH](https://svan.gmbh)
