#!/usr/bin/env node

/**
 * ERPNext MCP Server Extended
 * 
 * Extended MCP Server for ERPNext with:
 * - Improved error handling (returns detailed ERPNext error messages)
 * - Workflow management
 * - Custom fields and Property Setters
 * - DocType creation
 * - Document lifecycle (submit, cancel, delete)
 * 
 * Original: https://github.com/rakeshgangwar/erpnext-mcp-server
 * Extended by: SVAN GmbH (https://svan.gmbh)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Extract detailed error message from ERPNext API response
 * ERPNext returns errors in various formats, this function handles all of them
 */
function extractERPNextError(error: any): string {
  if (error.response?.data) {
    const data = error.response.data;
    
    // Try _server_messages first (most detailed, JSON-encoded array)
    if (data._server_messages) {
      try {
        const messages = JSON.parse(data._server_messages);
        const parsed = messages.map((m: string) => {
          try {
            const obj = JSON.parse(m);
            return obj.message || obj.msg || m;
          } catch {
            return m;
          }
        }).filter((m: string) => m && m.trim());
        
        if (parsed.length > 0) {
          return parsed.join('; ');
        }
      } catch {
        // Fall through
      }
    }
    
    if (data.message && typeof data.message === 'string') {
      return data.message;
    }
    
    if (data.exception) {
      const exception = data.exception;
      const match = exception.match(/(?:ValidationError|MandatoryError|LinkValidationError|DuplicateEntryError|TimestampMismatchError):\s*(.+?)(?:\n|$)/);
      if (match) {
        return match[0].trim();
      }
      return exception.split('\n')[0];
    }
    
    if (data.exc_type) {
      const msg = data.message || data.exc || 'Unknown error';
      return `${data.exc_type}: ${msg}`;
    }

    if (data._error_message) {
      return data._error_message;
    }
  }
  
  if (error.response?.status) {
    const status = error.response.status;
    const statusMessages: Record<number, string> = {
      400: 'Bad Request - Invalid data sent to ERPNext',
      401: 'Unauthorized - Check your API key and secret',
      403: 'Forbidden - You do not have permission for this operation',
      404: 'Not Found - The requested resource does not exist',
      409: 'Conflict - Document may have been modified by another user',
      417: 'Expectation Failed - Validation error in ERPNext',
      500: 'Internal Server Error - ERPNext encountered an error',
      502: 'Bad Gateway - ERPNext server is not responding',
      503: 'Service Unavailable - ERPNext is temporarily unavailable'
    };
    
    if (statusMessages[status]) {
      return `HTTP ${status}: ${statusMessages[status]}`;
    }
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'Unknown error occurred';
}

function formatErrorResponse(operation: string, error: any): string {
  const details = extractERPNextError(error);
  const status = error.response?.status ? ` (HTTP ${error.response.status})` : '';
  return `${operation}${status}: ${details}`;
}

const DEBUG = process.env.ERPNEXT_DEBUG === 'true';

function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.error(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

// ============================================================================
// ERPNEXT API CLIENT
// ============================================================================

class ERPNextClient {
  private baseUrl: string;
  private axiosInstance: AxiosInstance;
  private authenticated: boolean = false;

  constructor() {
    this.baseUrl = process.env.ERPNEXT_URL || '';
    
    if (!this.baseUrl) {
      throw new Error("ERPNEXT_URL environment variable is required");
    }
    
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    const apiKey = process.env.ERPNEXT_API_KEY;
    const apiSecret = process.env.ERPNEXT_API_SECRET;
    
    if (apiKey && apiSecret) {
      this.axiosInstance.defaults.headers.common['Authorization'] = 
        `token ${apiKey}:${apiSecret}`;
      this.authenticated = true;
    }

    this.axiosInstance.interceptors.response.use(
      (response) => {
        debugLog('API Response', { url: response.config.url, status: response.status });
        return response;
      },
      (error) => {
        debugLog('API Error', { url: error.config?.url, status: error.response?.status, data: error.response?.data });
        return Promise.reject(error);
      }
    );
  }

  isAuthenticated(): boolean { return this.authenticated; }

  async authenticate(username: string, password: string): Promise<boolean> {
    try {
      const response = await this.axiosInstance.post('/api/method/login', { usr: username, pwd: password });
      if (response.data.message === 'Logged In') {
        this.authenticated = true;
        return true;
      }
      return false;
    } catch (error: any) {
      throw new Error(formatErrorResponse('Authentication failed', error));
    }
  }

  async getDocument(doctype: string, name: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to get ${doctype} "${name}"`, error));
    }
  }

  async getDocList(doctype: string, filters?: Record<string, any>, fields?: string[], limit?: number): Promise<any[]> {
    try {
      const params: Record<string, any> = {};
      if (fields?.length) params['fields'] = JSON.stringify(fields);
      if (filters && Object.keys(filters).length > 0) params['filters'] = JSON.stringify(filters);
      if (limit) params['limit_page_length'] = limit;
      
      const response = await this.axiosInstance.get(`/api/resource/${encodeURIComponent(doctype)}`, { params });
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to get ${doctype} list`, error));
    }
  }

  async createDocument(doctype: string, doc: Record<string, any>): Promise<any> {
    try {
      debugLog(`Creating ${doctype}`, doc);
      const response = await this.axiosInstance.post(`/api/resource/${encodeURIComponent(doctype)}`, doc);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to create ${doctype}`, error));
    }
  }

  async updateDocument(doctype: string, name: string, doc: Record<string, any>): Promise<any> {
    try {
      debugLog(`Updating ${doctype} "${name}"`, doc);
      const response = await this.axiosInstance.put(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, doc);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to update ${doctype} "${name}"`, error));
    }
  }

  async deleteDocument(doctype: string, name: string): Promise<boolean> {
    try {
      debugLog(`Deleting ${doctype} "${name}"`);
      await this.axiosInstance.delete(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
      return true;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to delete ${doctype} "${name}"`, error));
    }
  }

  async submitDocument(doctype: string, name: string): Promise<any> {
    try {
      debugLog(`Submitting ${doctype} "${name}"`);
      const response = await this.axiosInstance.post('/api/method/frappe.client.submit', { doc: { doctype, name } });
      return response.data.message;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to submit ${doctype} "${name}"`, error));
    }
  }

  async cancelDocument(doctype: string, name: string): Promise<any> {
    try {
      debugLog(`Cancelling ${doctype} "${name}"`);
      const response = await this.axiosInstance.post('/api/method/frappe.client.cancel', { doctype, name });
      return response.data.message;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to cancel ${doctype} "${name}"`, error));
    }
  }

  async runReport(reportName: string, filters?: Record<string, any>): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/api/method/frappe.desk.query_report.run', {
        params: { report_name: reportName, filters: filters ? JSON.stringify(filters) : undefined }
      });
      return response.data.message;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to run report "${reportName}"`, error));
    }
  }

  async getAllDocTypes(): Promise<string[]> {
    try {
      const response = await this.axiosInstance.get('/api/resource/DocType', {
        params: { fields: JSON.stringify(["name"]), limit_page_length: 0 }
      });
      return response.data?.data?.map((item: any) => item.name).sort() || [];
    } catch (error: any) {
      throw new Error(formatErrorResponse('Failed to get DocTypes', error));
    }
  }

  async getDocTypeFields(doctype: string): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get('/api/method/frappe.client.get_list', {
        params: {
          doctype: 'DocField',
          filters: JSON.stringify({ parent: doctype }),
          fields: JSON.stringify(['fieldname', 'label', 'fieldtype', 'options', 'reqd', 'default', 'description', 'in_list_view', 'read_only', 'hidden', 'idx']),
          limit_page_length: 0,
          order_by: 'idx asc'
        }
      });
      return response.data.message || [];
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to get fields for ${doctype}`, error));
    }
  }

  async getDocTypeMeta(doctype: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/api/method/frappe.desk.form.utils.get_meta', { params: { doctype } });
      return response.data.message;
    } catch (error: any) {
      try {
        return await this.getDocument('DocType', doctype);
      } catch {
        throw new Error(formatErrorResponse(`Failed to get metadata for ${doctype}`, error));
      }
    }
  }

  async createDocType(name: string, module: string, fields: any[], options: { is_submittable?: boolean; is_child_table?: boolean; autoname?: string; title_field?: string; permissions?: any[] } = {}): Promise<any> {
    try {
      const doc: Record<string, any> = {
        doctype: 'DocType', name, module, custom: 1, fields,
        is_submittable: options.is_submittable ? 1 : 0,
        istable: options.is_child_table ? 1 : 0
      };
      if (options.autoname) doc.autoname = options.autoname;
      if (options.title_field) doc.title_field = options.title_field;
      doc.permissions = options.permissions?.length ? options.permissions : [{ role: 'System Manager', read: 1, write: 1, create: 1, delete: 1 }];

      debugLog('Creating DocType', doc);
      const response = await this.axiosInstance.post('/api/resource/DocType', doc);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to create DocType "${name}"`, error));
    }
  }

  async addCustomField(doctype: string, fieldname: string, fieldtype: string, label: string, options: { options?: string; reqd?: number; insert_after?: string; description?: string; default?: string } = {}): Promise<any> {
    try {
      const doc: Record<string, any> = { doctype: 'Custom Field', dt: doctype, fieldname, fieldtype, label, name: `${doctype}-${fieldname}` };
      if (options.options) doc.options = options.options;
      if (options.reqd !== undefined) doc.reqd = options.reqd;
      if (options.insert_after) doc.insert_after = options.insert_after;
      if (options.description) doc.description = options.description;
      if (options.default) doc.default = options.default;

      debugLog('Creating Custom Field', doc);
      const response = await this.axiosInstance.post('/api/resource/Custom Field', doc);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to add custom field "${fieldname}" to ${doctype}`, error));
    }
  }

  async createPropertySetter(doctype: string, property: string, value: string, fieldname?: string): Promise<any> {
    try {
      const docName = fieldname ? `${doctype}-${fieldname}-${property}` : `${doctype}-main-${property}`;
      const doc: Record<string, any> = { doctype: 'Property Setter', name: docName, doc_type: doctype, property, value, property_type: 'Data' };
      if (fieldname) { doc.field_name = fieldname; doc.doctype_or_field = 'DocField'; }
      else { doc.doctype_or_field = 'DocType'; }

      debugLog('Creating Property Setter', doc);
      const response = await this.axiosInstance.post('/api/resource/Property Setter', doc);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to create property setter for ${doctype}`, error));
    }
  }

  async getWorkflow(doctype: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/api/resource/Workflow', {
        params: { filters: JSON.stringify({ document_type: doctype, is_active: 1 }), limit_page_length: 1 }
      });
      if (response.data.data?.length > 0) {
        return await this.getDocument('Workflow', response.data.data[0].name);
      }
      return null;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to get workflow for ${doctype}`, error));
    }
  }

  async createWorkflow(workflowName: string, documentType: string, states: any[], transitions: any[], isActive: boolean = true): Promise<any> {
    try {
      const doc = { doctype: 'Workflow', workflow_name: workflowName, document_type: documentType, is_active: isActive ? 1 : 0, states, transitions };
      debugLog('Creating Workflow', doc);
      const response = await this.axiosInstance.post('/api/resource/Workflow', doc);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to create workflow "${workflowName}"`, error));
    }
  }

  async updateWorkflow(name: string, updates: Record<string, any>): Promise<any> {
    try {
      debugLog(`Updating Workflow "${name}"`, updates);
      const response = await this.axiosInstance.put(`/api/resource/Workflow/${encodeURIComponent(name)}`, updates);
      return response.data.data;
    } catch (error: any) {
      throw new Error(formatErrorResponse(`Failed to update workflow "${name}"`, error));
    }
  }
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

const erpnext = new ERPNextClient();

const server = new Server(
  { name: "erpnext-server-extended", version: "1.0.0" },
  { capabilities: { resources: {}, tools: {} } }
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [{ uri: "erpnext://DocTypes", name: "All DocTypes", mimeType: "application/json", description: "List of all available DocTypes" }]
}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [{ uriTemplate: "erpnext://{doctype}/{name}", name: "ERPNext Document", mimeType: "application/json", description: "Fetch document by doctype and name" }]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!erpnext.isAuthenticated()) throw new McpError(ErrorCode.InvalidRequest, "Not authenticated with ERPNext");
  const uri = request.params.uri;
  let result: any;

  if (uri === "erpnext://DocTypes") {
    result = { doctypes: await erpnext.getAllDocTypes() };
  } else {
    const match = uri.match(/^erpnext:\/\/([^\/]+)\/(.+)$/);
    if (match) result = await erpnext.getDocument(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
  }

  if (!result) throw new McpError(ErrorCode.InvalidRequest, `Invalid URI: ${uri}`);
  return { contents: [{ uri: request.params.uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "authenticate_erpnext", description: "Authenticate with ERPNext using username and password.", inputSchema: { type: "object", properties: { username: { type: "string", description: "ERPNext username" }, password: { type: "string", description: "ERPNext password" } }, required: ["username", "password"] } },
    { name: "get_documents", description: "Get a list of documents for a specific DocType with optional filtering.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, fields: { type: "array", items: { type: "string" }, description: "Fields to include" }, filters: { type: "object", description: "Filter conditions" }, limit: { type: "number", description: "Max documents" } }, required: ["doctype"] } },
    { name: "get_document", description: "Get a single document by DocType and name.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, name: { type: "string", description: "Document name/ID" } }, required: ["doctype", "name"] } },
    { name: "create_document", description: "Create a new document in ERPNext.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, data: { type: "object", description: "Document data" } }, required: ["doctype", "data"] } },
    { name: "update_document", description: "Update an existing document in ERPNext.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, name: { type: "string", description: "Document name/ID" }, data: { type: "object", description: "Fields to update" } }, required: ["doctype", "name", "data"] } },
    { name: "delete_document", description: "Delete a document from ERPNext.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, name: { type: "string", description: "Document name/ID" } }, required: ["doctype", "name"] } },
    { name: "submit_document", description: "Submit a document (Draft → Submitted).", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, name: { type: "string", description: "Document name/ID" } }, required: ["doctype", "name"] } },
    { name: "cancel_document", description: "Cancel a submitted document.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" }, name: { type: "string", description: "Document name/ID" } }, required: ["doctype", "name"] } },
    { name: "get_doctypes", description: "Get a list of all available DocTypes.", inputSchema: { type: "object", properties: {} } },
    { name: "get_doctype_fields", description: "Get field definitions for a DocType.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" } }, required: ["doctype"] } },
    { name: "get_doctype_meta", description: "Get complete DocType metadata.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "ERPNext DocType" } }, required: ["doctype"] } },
    { name: "create_doctype", description: "Create a new DocType.", inputSchema: { type: "object", properties: { name: { type: "string", description: "DocType name" }, module: { type: "string", description: "Module" }, fields: { type: "array", items: { type: "object", properties: { fieldname: { type: "string" }, fieldtype: { type: "string" }, label: { type: "string" }, options: { type: "string" }, reqd: { type: "number" }, in_list_view: { type: "number" }, default: { type: "string" }, description: { type: "string" } }, required: ["fieldname", "fieldtype", "label"] }, description: "Field definitions" }, is_submittable: { type: "boolean" }, is_child_table: { type: "boolean" }, autoname: { type: "string" }, title_field: { type: "string" }, permissions: { type: "array", items: { type: "object" } } }, required: ["name", "module", "fields"] } },
    { name: "add_doctype_field", description: "Add a custom field to a DocType.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "Target DocType" }, fieldname: { type: "string", description: "Field name" }, fieldtype: { type: "string", description: "Field type" }, label: { type: "string", description: "Label" }, options: { type: "string", description: "Options" }, reqd: { type: "number", description: "Required (0/1)" }, insert_after: { type: "string", description: "Insert after field" }, description: { type: "string", description: "Help text" } }, required: ["doctype", "fieldname", "fieldtype", "label"] } },
    { name: "get_workflow", description: "Get active workflow for a DocType.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "DocType" } }, required: ["doctype"] } },
    { name: "create_workflow", description: "Create a new workflow.", inputSchema: { type: "object", properties: { workflow_name: { type: "string", description: "Workflow name" }, document_type: { type: "string", description: "DocType" }, states: { type: "array", items: { type: "object", properties: { state: { type: "string" }, doc_status: { type: "string" }, allow_edit: { type: "string" }, style: { type: "string" } }, required: ["state", "doc_status"] } }, transitions: { type: "array", items: { type: "object", properties: { state: { type: "string" }, action: { type: "string" }, next_state: { type: "string" }, allowed: { type: "string" }, condition: { type: "string" } }, required: ["state", "action", "next_state", "allowed"] } }, is_active: { type: "boolean" } }, required: ["workflow_name", "document_type", "states", "transitions"] } },
    { name: "update_workflow", description: "Update an existing workflow.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Workflow name" }, updates: { type: "object", description: "Properties to update" } }, required: ["name", "updates"] } },
    { name: "create_custom_field", description: "Create a custom field (survives updates).", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "Target DocType" }, fieldname: { type: "string", description: "Field name" }, fieldtype: { type: "string", description: "Field type" }, label: { type: "string", description: "Label" }, options: { type: "string", description: "Options" }, insert_after: { type: "string", description: "Insert after" } }, required: ["doctype", "fieldname", "fieldtype", "label"] } },
    { name: "create_property_setter", description: "Override DocType/field property.", inputSchema: { type: "object", properties: { doctype: { type: "string", description: "Target DocType" }, property: { type: "string", description: "Property" }, value: { type: "string", description: "New value" }, fieldname: { type: "string", description: "Target field" } }, required: ["doctype", "property", "value"] } },
    { name: "run_report", description: "Run an ERPNext report.", inputSchema: { type: "object", properties: { report_name: { type: "string", description: "Report name" }, filters: { type: "object", description: "Filters" } }, required: ["report_name"] } }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments as Record<string, any> || {};
  const errorResponse = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });
  const successResponse = (data: any, message?: string) => ({ content: [{ type: "text" as const, text: message ? `${message}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2) }] });

  if (request.params.name !== 'authenticate_erpnext' && !erpnext.isAuthenticated()) {
    return errorResponse("Not authenticated with ERPNext. Configure API key or use authenticate_erpnext.");
  }

  try {
    switch (request.params.name) {
      case "authenticate_erpnext": {
        const success = await erpnext.authenticate(args.username, args.password);
        return success ? successResponse({ authenticated: true }, "Successfully authenticated") : errorResponse("Authentication failed");
      }
      case "get_documents": return successResponse(await erpnext.getDocList(args.doctype, args.filters, args.fields, args.limit));
      case "get_document": return successResponse(await erpnext.getDocument(args.doctype, args.name));
      case "create_document": { const r = await erpnext.createDocument(args.doctype, args.data); return successResponse(r, `Created ${args.doctype}: ${r.name}`); }
      case "update_document": { const r = await erpnext.updateDocument(args.doctype, args.name, args.data); return successResponse(r, `Updated ${args.doctype}: ${args.name}`); }
      case "delete_document": { await erpnext.deleteDocument(args.doctype, args.name); return successResponse({ deleted: true }, `Deleted ${args.doctype}: ${args.name}`); }
      case "submit_document": { const r = await erpnext.submitDocument(args.doctype, args.name); return successResponse(r, `Submitted ${args.doctype}: ${args.name}`); }
      case "cancel_document": { const r = await erpnext.cancelDocument(args.doctype, args.name); return successResponse(r, `Cancelled ${args.doctype}: ${args.name}`); }
      case "get_doctypes": return successResponse(await erpnext.getAllDocTypes());
      case "get_doctype_fields": return successResponse(await erpnext.getDocTypeFields(args.doctype));
      case "get_doctype_meta": return successResponse(await erpnext.getDocTypeMeta(args.doctype));
      case "create_doctype": { const r = await erpnext.createDocType(args.name, args.module, args.fields, { is_submittable: args.is_submittable, is_child_table: args.is_child_table, autoname: args.autoname, title_field: args.title_field, permissions: args.permissions }); return successResponse(r, `Created DocType: ${args.name}`); }
      case "add_doctype_field": { const r = await erpnext.addCustomField(args.doctype, args.fieldname, args.fieldtype, args.label, { options: args.options, reqd: args.reqd, insert_after: args.insert_after, description: args.description }); return successResponse(r, `Added field "${args.fieldname}" to ${args.doctype}`); }
      case "get_workflow": { const w = await erpnext.getWorkflow(args.doctype); return w ? successResponse(w) : successResponse({ workflow: null }, `No active workflow for ${args.doctype}`); }
      case "create_workflow": { const r = await erpnext.createWorkflow(args.workflow_name, args.document_type, args.states, args.transitions, args.is_active !== false); return successResponse(r, `Created workflow: ${args.workflow_name}`); }
      case "update_workflow": { const r = await erpnext.updateWorkflow(args.name, args.updates); return successResponse(r, `Updated workflow: ${args.name}`); }
      case "create_custom_field": { const r = await erpnext.addCustomField(args.doctype, args.fieldname, args.fieldtype, args.label, { options: args.options, insert_after: args.insert_after }); return successResponse(r, `Created custom field: ${args.doctype}-${args.fieldname}`); }
      case "create_property_setter": { const r = await erpnext.createPropertySetter(args.doctype, args.property, args.value, args.fieldname); return successResponse(r, `Created property setter for ${args.doctype}`); }
      case "run_report": return successResponse(await erpnext.runReport(args.report_name, args.filters));
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return errorResponse(error.message || 'Unknown error');
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ERPNext MCP Server Extended v1.0.0 running on stdio');
  console.error(`Connected to: ${process.env.ERPNEXT_URL}`);
  console.error(`Debug mode: ${DEBUG ? 'enabled' : 'disabled'}`);
}

main().catch((error) => { console.error("Server error:", error); process.exit(1); });
