use crate::db::{Database, DbResult};
use crate::models::{
    AiCanvasFile, AiCanvasOperation, AiCanvasVersion, AiCanvasWorkspace, AiChatMessage,
    AiCitation, AiConversation, AiMemory, AiProject, AiResearchJob, AiResearchSource,
    CreateAiCanvasOperationInput, CreateAiCanvasVersionInput, CreateAiCanvasWorkspaceInput,
    CreateAiCitationInput, CreateAiConversationInput, CreateAiMemoryInput, CreateAiMessageInput,
    CreateAiProjectInput, CreateAiResearchJobInput, CreateAiResearchSourceInput, ListAiMemoriesInput,
    ListAiResearchJobsInput,
    UpdateAiCanvasOperationInput, UpdateAiCanvasWorkspaceInput, UpdateAiConversationInput,
    UpdateAiMemoryInput, UpdateAiMessageInput, UpdateAiProjectInput, UpdateAiResearchJobInput,
    UpsertAiCanvasFileInput,
};
use rusqlite::{params, Connection};

pub struct AiService;

impl AiService {
    pub fn create_conversation(
        db: &Database,
        input: CreateAiConversationInput,
    ) -> DbResult<AiConversation> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_chat_conversations (
                    id, title, provider_id, model_id, system_prompt, project_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.id,
                    input.title,
                    input.provider_id,
                    input.model_id,
                    input.system_prompt,
                    input.project_id
                ],
            )?;
            Self::get_conversation(conn, &input.id)
        })
    }

    pub fn list_conversations(db: &Database) -> DbResult<Vec<AiConversation>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, provider_id, model_id, system_prompt, project_id, pinned, archived, created_at, updated_at
                 FROM ai_chat_conversations
                 WHERE archived = 0
                 ORDER BY pinned DESC, updated_at DESC, created_at DESC",
            )?;
            let rows = stmt
                .query_map([], Self::map_conversation)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn update_conversation(
        db: &Database,
        id: &str,
        input: UpdateAiConversationInput,
    ) -> DbResult<AiConversation> {
        db.transaction(|conn| {
            let current = Self::get_conversation(conn, id)?;
            conn.execute(
                "UPDATE ai_chat_conversations
                 SET title = ?1,
                     provider_id = ?2,
                     model_id = ?3,
                     system_prompt = ?4,
                     project_id = ?5,
                     pinned = ?6,
                     archived = ?7,
                     updated_at = datetime('now')
                 WHERE id = ?8",
                params![
                    input.title.unwrap_or(current.title),
                    input.provider_id.unwrap_or(current.provider_id),
                    input.model_id.unwrap_or(current.model_id),
                    input.system_prompt.or(current.system_prompt),
                    input.project_id.or(current.project_id),
                    input.pinned.unwrap_or(current.pinned) as i64,
                    input.archived.unwrap_or(current.archived) as i64,
                    id,
                ],
            )?;
            Self::get_conversation(conn, id)
        })
    }

    pub fn delete_conversation(db: &Database, id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM ai_chat_conversations WHERE id = ?1",
                params![id],
            )?;
            Ok(())
        })
    }

    pub fn list_messages(db: &Database, conversation_id: &str) -> DbResult<Vec<AiChatMessage>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, conversation_id, role, content, status, parent_message_id,
                        model_id, provider_id, token_usage_json, metadata_json, created_at, updated_at
                 FROM ai_chat_messages
                 WHERE conversation_id = ?1
                 ORDER BY created_at ASC, rowid ASC",
            )?;
            let rows = stmt
                .query_map(params![conversation_id], Self::map_message)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn insert_message(db: &Database, input: CreateAiMessageInput) -> DbResult<AiChatMessage> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_chat_messages (
                    id, conversation_id, role, content, status, parent_message_id,
                    model_id, provider_id, token_usage_json, metadata_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    input.id,
                    input.conversation_id,
                    input.role,
                    input.content,
                    input.status,
                    input.parent_message_id,
                    input.model_id,
                    input.provider_id,
                    input.token_usage_json,
                    input.metadata_json,
                ],
            )?;
            conn.execute(
                "UPDATE ai_chat_conversations SET updated_at = datetime('now') WHERE id = ?1",
                params![input.conversation_id],
            )?;
            Self::get_message(conn, &input.id)
        })
    }

    pub fn update_message(
        db: &Database,
        id: &str,
        input: UpdateAiMessageInput,
    ) -> DbResult<AiChatMessage> {
        db.transaction(|conn| {
            let current = Self::get_message(conn, id)?;
            conn.execute(
                "UPDATE ai_chat_messages
                 SET content = ?1,
                     status = ?2,
                     token_usage_json = ?3,
                     metadata_json = ?4,
                     updated_at = datetime('now')
                 WHERE id = ?5",
                params![
                    input.content.unwrap_or(current.content),
                    input.status.unwrap_or(current.status),
                    input.token_usage_json.or(current.token_usage_json),
                    input.metadata_json.or(current.metadata_json),
                    id,
                ],
            )?;
            Self::get_message(conn, id)
        })
    }

    pub fn insert_citation(db: &Database, input: CreateAiCitationInput) -> DbResult<AiCitation> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_message_citations (
                    id, message_id, source_type, title, url, source_id, snippet, metadata_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    input.id,
                    input.message_id,
                    input.source_type,
                    input.title,
                    input.url,
                    input.source_id,
                    input.snippet,
                    input.metadata_json,
                ],
            )?;
            Self::get_citation(conn, &input.id)
        })
    }

    pub fn list_citations(db: &Database, message_id: &str) -> DbResult<Vec<AiCitation>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, message_id, source_type, title, url, source_id, snippet, metadata_json, created_at
                 FROM ai_message_citations
                 WHERE message_id = ?1
                 ORDER BY created_at ASC, rowid ASC",
            )?;
            let rows = stmt
                .query_map(params![message_id], Self::map_citation)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn list_canvas_workspaces(
        db: &Database,
        conversation_id: &str,
    ) -> DbResult<Vec<AiCanvasWorkspace>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, conversation_id, title, mode, active_version_id, created_at, updated_at
                 FROM ai_canvas_workspaces
                 WHERE conversation_id = ?1
                 ORDER BY updated_at DESC, created_at DESC",
            )?;
            let rows = stmt
                .query_map(params![conversation_id], Self::map_canvas_workspace)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_canvas_workspace(
        db: &Database,
        input: CreateAiCanvasWorkspaceInput,
    ) -> DbResult<AiCanvasWorkspace> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_workspaces (
                    id, conversation_id, title, mode
                 ) VALUES (?1, ?2, ?3, ?4)",
                params![input.id, input.conversation_id, input.title, input.mode],
            )?;
            conn.execute(
                "UPDATE ai_chat_conversations SET updated_at = datetime('now') WHERE id = ?1",
                params![input.conversation_id],
            )?;
            Self::get_canvas_workspace(conn, &input.id)
        })
    }

    pub fn update_canvas_workspace(
        db: &Database,
        id: &str,
        input: UpdateAiCanvasWorkspaceInput,
    ) -> DbResult<AiCanvasWorkspace> {
        db.transaction(|conn| {
            let current = Self::get_canvas_workspace(conn, id)?;
            conn.execute(
                "UPDATE ai_canvas_workspaces
                 SET title = ?1,
                     mode = ?2,
                     active_version_id = ?3,
                     updated_at = datetime('now')
                 WHERE id = ?4",
                params![
                    input.title.unwrap_or(current.title),
                    input.mode.unwrap_or(current.mode),
                    input.active_version_id.or(current.active_version_id),
                    id,
                ],
            )?;
            Self::get_canvas_workspace(conn, id)
        })
    }

    pub fn delete_canvas_workspace(db: &Database, id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM ai_canvas_workspaces WHERE id = ?1", params![id])?;
            Ok(())
        })
    }

    pub fn list_canvas_files(db: &Database, workspace_id: &str) -> DbResult<Vec<AiCanvasFile>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, path, language, content, created_at, updated_at
                 FROM ai_canvas_files
                 WHERE workspace_id = ?1
                 ORDER BY path ASC",
            )?;
            let rows = stmt
                .query_map(params![workspace_id], Self::map_canvas_file)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_canvas_file(
        db: &Database,
        input: UpsertAiCanvasFileInput,
    ) -> DbResult<AiCanvasFile> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_files (
                    id, workspace_id, path, language, content
                 ) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(workspace_id, path) DO UPDATE SET
                    language = excluded.language,
                    content = excluded.content,
                    updated_at = datetime('now')",
                params![
                    input.id,
                    input.workspace_id,
                    input.path,
                    input.language,
                    input.content,
                ],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![input.workspace_id],
            )?;
            Self::get_canvas_file(conn, &input.workspace_id, &input.path)
        })
    }

    pub fn delete_canvas_file(db: &Database, workspace_id: &str, path: &str) -> DbResult<()> {
        db.transaction(|conn| {
            conn.execute(
                "DELETE FROM ai_canvas_files WHERE workspace_id = ?1 AND path = ?2",
                params![workspace_id, path],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![workspace_id],
            )?;
            Ok(())
        })
    }

    pub fn list_canvas_versions(
        db: &Database,
        workspace_id: &str,
    ) -> DbResult<Vec<AiCanvasVersion>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, version_no, snapshot_json, source_message_id, created_at
                 FROM ai_canvas_versions
                 WHERE workspace_id = ?1
                 ORDER BY version_no DESC",
            )?;
            let rows = stmt
                .query_map(params![workspace_id], Self::map_canvas_version)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_canvas_version(
        db: &Database,
        input: CreateAiCanvasVersionInput,
    ) -> DbResult<AiCanvasVersion> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_versions (
                    id, workspace_id, version_no, snapshot_json, source_message_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    input.id,
                    input.workspace_id,
                    input.version_no,
                    input.snapshot_json,
                    input.source_message_id,
                ],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces
                 SET active_version_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2",
                params![input.id, input.workspace_id],
            )?;
            Self::get_canvas_version(conn, &input.id)
        })
    }

    pub fn list_canvas_operations(
        db: &Database,
        workspace_id: &str,
    ) -> DbResult<Vec<AiCanvasOperation>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, source_message_id, operation_type, payload_json, status, created_at
                 FROM ai_canvas_operations
                 WHERE workspace_id = ?1
                 ORDER BY created_at DESC, rowid DESC",
            )?;
            let rows = stmt
                .query_map(params![workspace_id], Self::map_canvas_operation)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn list_projects(db: &Database) -> DbResult<Vec<AiProject>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, instructions, knowledge_library_id, knowledge_space_id,
                        include_global_memory, archived, created_at, updated_at
                 FROM ai_projects
                 WHERE archived = 0
                 ORDER BY updated_at DESC, created_at DESC",
            )?;
            let rows = stmt
                .query_map([], Self::map_project)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_project(db: &Database, input: CreateAiProjectInput) -> DbResult<AiProject> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_projects (
                    id, name, instructions, knowledge_library_id, knowledge_space_id, include_global_memory
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.id,
                    input.name,
                    input.instructions,
                    input.knowledge_library_id,
                    input.knowledge_space_id,
                    input.include_global_memory as i64,
                ],
            )?;
            Self::get_project(conn, &input.id)
        })
    }

    pub fn update_project(
        db: &Database,
        id: &str,
        input: UpdateAiProjectInput,
    ) -> DbResult<AiProject> {
        db.transaction(|conn| {
            let current = Self::get_project(conn, id)?;
            conn.execute(
                "UPDATE ai_projects
                 SET name = ?1,
                     instructions = ?2,
                     knowledge_library_id = ?3,
                     knowledge_space_id = ?4,
                     include_global_memory = ?5,
                     archived = ?6,
                     updated_at = datetime('now')
                 WHERE id = ?7",
                params![
                    input.name.unwrap_or(current.name),
                    input.instructions.or(current.instructions),
                    input.knowledge_library_id.or(current.knowledge_library_id),
                    input.knowledge_space_id.or(current.knowledge_space_id),
                    input
                        .include_global_memory
                        .unwrap_or(current.include_global_memory) as i64,
                    input.archived.unwrap_or(current.archived) as i64,
                    id,
                ],
            )?;
            Self::get_project(conn, id)
        })
    }

    pub fn delete_project(db: &Database, id: &str) -> DbResult<()> {
        db.transaction(|conn| {
            conn.execute(
                "UPDATE ai_projects SET archived = 1, updated_at = datetime('now') WHERE id = ?1",
                params![id],
            )?;
            conn.execute(
                "UPDATE ai_chat_conversations SET project_id = NULL, updated_at = datetime('now') WHERE project_id = ?1",
                params![id],
            )?;
            Ok(())
        })
    }

    pub fn list_memories(
        db: &Database,
        input: Option<ListAiMemoriesInput>,
    ) -> DbResult<Vec<AiMemory>> {
        db.with_connection(|conn| {
            let input = input.unwrap_or(ListAiMemoriesInput {
                scope: None,
                scope_id: None,
                enabled: None,
                limit: None,
            });
            let limit = input.limit.unwrap_or(100).clamp(1, 500);
            let enabled = input.enabled.map(|value| value as i64);
            let mut stmt = conn.prepare(
                "SELECT id, scope, scope_id, content, source_message_id, enabled, created_at, updated_at
                 FROM ai_memories
                 WHERE (?1 IS NULL OR scope = ?1)
                   AND (?2 IS NULL OR scope_id = ?2)
                   AND (?3 IS NULL OR enabled = ?3)
                 ORDER BY updated_at DESC, created_at DESC
                 LIMIT ?4",
            )?;
            let rows = stmt
                .query_map(params![input.scope, input.scope_id, enabled, limit], Self::map_memory)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_memory(db: &Database, input: CreateAiMemoryInput) -> DbResult<AiMemory> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_memories (
                    id, scope, scope_id, content, source_message_id, enabled
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.id,
                    input.scope,
                    input.scope_id,
                    input.content,
                    input.source_message_id,
                    input.enabled as i64,
                ],
            )?;
            Self::get_memory(conn, &input.id)
        })
    }

    pub fn update_memory(
        db: &Database,
        id: &str,
        input: UpdateAiMemoryInput,
    ) -> DbResult<AiMemory> {
        db.transaction(|conn| {
            let current = Self::get_memory(conn, id)?;
            conn.execute(
                "UPDATE ai_memories
                 SET content = ?1,
                     enabled = ?2,
                     updated_at = datetime('now')
                 WHERE id = ?3",
                params![
                    input.content.unwrap_or(current.content),
                    input.enabled.unwrap_or(current.enabled) as i64,
                    id,
                ],
            )?;
            Self::get_memory(conn, id)
        })
    }

    pub fn delete_memory(db: &Database, id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM ai_memories WHERE id = ?1", params![id])?;
            Ok(())
        })
    }

    pub fn get_canvas_operation_by_id(db: &Database, id: &str) -> DbResult<AiCanvasOperation> {
        db.with_connection(|conn| Self::get_canvas_operation(conn, id))
    }

    pub fn create_canvas_operation(
        db: &Database,
        input: CreateAiCanvasOperationInput,
    ) -> DbResult<AiCanvasOperation> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_operations (
                    id, workspace_id, source_message_id, operation_type, payload_json, status
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.id,
                    input.workspace_id,
                    input.source_message_id,
                    input.operation_type,
                    input.payload_json,
                    input.status,
                ],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![input.workspace_id],
            )?;
            Self::get_canvas_operation(conn, &input.id)
        })
    }

    pub fn update_canvas_operation(
        db: &Database,
        id: &str,
        input: UpdateAiCanvasOperationInput,
    ) -> DbResult<AiCanvasOperation> {
        db.transaction(|conn| {
            let current = Self::get_canvas_operation(conn, id)?;
            let workspace_id = current.workspace_id.clone();
            let payload_json = input.payload_json.unwrap_or(current.payload_json);
            let status = input.status.unwrap_or(current.status);
            conn.execute(
                "UPDATE ai_canvas_operations
                 SET payload_json = ?1,
                     status = ?2
                 WHERE id = ?3",
                params![payload_json, status, id],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![workspace_id],
            )?;
            Self::get_canvas_operation(conn, id)
        })
    }

    pub fn create_research_job(
        db: &Database,
        input: CreateAiResearchJobInput,
    ) -> DbResult<AiResearchJob> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_research_jobs (
                    id, title, query, status, stage, provider_id, model_id, progress, options_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    input.id,
                    input.title,
                    input.query,
                    input.status,
                    input.stage,
                    input.provider_id,
                    input.model_id,
                    input.progress,
                    input.options_json,
                ],
            )?;
            Self::get_research_job(conn, &input.id)
        })
    }

    pub fn get_research_job_by_id(db: &Database, id: &str) -> DbResult<AiResearchJob> {
        db.with_connection(|conn| Self::get_research_job(conn, id))
    }

    pub fn list_research_jobs(
        db: &Database,
        input: Option<ListAiResearchJobsInput>,
    ) -> DbResult<Vec<AiResearchJob>> {
        db.with_connection(|conn| {
            let input = input.unwrap_or(ListAiResearchJobsInput {
                status: None,
                limit: None,
            });
            let limit = input.limit.unwrap_or(30).clamp(1, 200);
            let mut stmt = conn.prepare(
                "SELECT id, title, query, status, stage, provider_id, model_id, progress,
                        report_markdown, error_message, options_json, created_at, updated_at, completed_at
                 FROM ai_research_jobs
                 WHERE (?1 IS NULL OR status = ?1)
                 ORDER BY updated_at DESC, created_at DESC
                 LIMIT ?2",
            )?;
            let rows = stmt
                .query_map(params![input.status, limit], Self::map_research_job)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn update_research_job(
        db: &Database,
        id: &str,
        input: UpdateAiResearchJobInput,
    ) -> DbResult<AiResearchJob> {
        db.transaction(|conn| {
            let current = Self::get_research_job(conn, id)?;
            conn.execute(
                "UPDATE ai_research_jobs
                 SET title = ?1,
                     status = ?2,
                     stage = ?3,
                     progress = ?4,
                     report_markdown = ?5,
                     error_message = ?6,
                     options_json = ?7,
                     completed_at = ?8,
                     updated_at = datetime('now')
                 WHERE id = ?9",
                params![
                    input.title.unwrap_or(current.title),
                    input.status.unwrap_or(current.status),
                    input.stage.unwrap_or(current.stage),
                    input.progress.unwrap_or(current.progress),
                    input.report_markdown.or(current.report_markdown),
                    input.error_message.or(current.error_message),
                    input.options_json.or(current.options_json),
                    input.completed_at.or(current.completed_at),
                    id,
                ],
            )?;
            Self::get_research_job(conn, id)
        })
    }

    pub fn insert_research_source(
        db: &Database,
        input: CreateAiResearchSourceInput,
    ) -> DbResult<AiResearchSource> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_research_sources (
                    id, job_id, source_type, title, url, source_id, snippet, summary, metadata_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    input.id,
                    input.job_id,
                    input.source_type,
                    input.title,
                    input.url,
                    input.source_id,
                    input.snippet,
                    input.summary,
                    input.metadata_json,
                ],
            )?;
            Self::get_research_source(conn, &input.id)
        })
    }

    pub fn list_research_sources(
        db: &Database,
        job_id: &str,
    ) -> DbResult<Vec<AiResearchSource>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, job_id, source_type, title, url, source_id, snippet, summary, metadata_json, created_at
                 FROM ai_research_sources
                 WHERE job_id = ?1
                 ORDER BY created_at ASC, rowid ASC",
            )?;
            let rows = stmt
                .query_map(params![job_id], Self::map_research_source)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    fn get_conversation(conn: &Connection, id: &str) -> DbResult<AiConversation> {
        conn.query_row(
            "SELECT id, title, provider_id, model_id, system_prompt, project_id, pinned, archived, created_at, updated_at
             FROM ai_chat_conversations
             WHERE id = ?1",
            params![id],
            Self::map_conversation,
        )
        .map_err(Into::into)
    }

    fn get_message(conn: &Connection, id: &str) -> DbResult<AiChatMessage> {
        conn.query_row(
            "SELECT id, conversation_id, role, content, status, parent_message_id,
                    model_id, provider_id, token_usage_json, metadata_json, created_at, updated_at
             FROM ai_chat_messages
             WHERE id = ?1",
            params![id],
            Self::map_message,
        )
        .map_err(Into::into)
    }

    fn get_citation(conn: &Connection, id: &str) -> DbResult<AiCitation> {
        conn.query_row(
            "SELECT id, message_id, source_type, title, url, source_id, snippet, metadata_json, created_at
             FROM ai_message_citations
             WHERE id = ?1",
            params![id],
            Self::map_citation,
        )
        .map_err(Into::into)
    }

    fn get_canvas_workspace(conn: &Connection, id: &str) -> DbResult<AiCanvasWorkspace> {
        conn.query_row(
            "SELECT id, conversation_id, title, mode, active_version_id, created_at, updated_at
             FROM ai_canvas_workspaces
             WHERE id = ?1",
            params![id],
            Self::map_canvas_workspace,
        )
        .map_err(Into::into)
    }

    fn get_canvas_file(
        conn: &Connection,
        workspace_id: &str,
        path: &str,
    ) -> DbResult<AiCanvasFile> {
        conn.query_row(
            "SELECT id, workspace_id, path, language, content, created_at, updated_at
             FROM ai_canvas_files
             WHERE workspace_id = ?1 AND path = ?2",
            params![workspace_id, path],
            Self::map_canvas_file,
        )
        .map_err(Into::into)
    }

    fn get_canvas_version(conn: &Connection, id: &str) -> DbResult<AiCanvasVersion> {
        conn.query_row(
            "SELECT id, workspace_id, version_no, snapshot_json, source_message_id, created_at
             FROM ai_canvas_versions
             WHERE id = ?1",
            params![id],
            Self::map_canvas_version,
        )
        .map_err(Into::into)
    }

    fn get_canvas_operation(conn: &Connection, id: &str) -> DbResult<AiCanvasOperation> {
        conn.query_row(
            "SELECT id, workspace_id, source_message_id, operation_type, payload_json, status, created_at
             FROM ai_canvas_operations
             WHERE id = ?1",
            params![id],
            Self::map_canvas_operation,
        )
        .map_err(Into::into)
    }

    fn get_project(conn: &Connection, id: &str) -> DbResult<AiProject> {
        conn.query_row(
            "SELECT id, name, instructions, knowledge_library_id, knowledge_space_id,
                    include_global_memory, archived, created_at, updated_at
             FROM ai_projects
             WHERE id = ?1",
            params![id],
            Self::map_project,
        )
        .map_err(Into::into)
    }

    fn get_memory(conn: &Connection, id: &str) -> DbResult<AiMemory> {
        conn.query_row(
            "SELECT id, scope, scope_id, content, source_message_id, enabled, created_at, updated_at
             FROM ai_memories
             WHERE id = ?1",
            params![id],
            Self::map_memory,
        )
        .map_err(Into::into)
    }

    fn get_research_job(conn: &Connection, id: &str) -> DbResult<AiResearchJob> {
        conn.query_row(
            "SELECT id, title, query, status, stage, provider_id, model_id, progress,
                    report_markdown, error_message, options_json, created_at, updated_at, completed_at
             FROM ai_research_jobs
             WHERE id = ?1",
            params![id],
            Self::map_research_job,
        )
        .map_err(Into::into)
    }

    fn get_research_source(conn: &Connection, id: &str) -> DbResult<AiResearchSource> {
        conn.query_row(
            "SELECT id, job_id, source_type, title, url, source_id, snippet, summary, metadata_json, created_at
             FROM ai_research_sources
             WHERE id = ?1",
            params![id],
            Self::map_research_source,
        )
        .map_err(Into::into)
    }

    fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiConversation> {
        Ok(AiConversation {
            id: row.get(0)?,
            title: row.get(1)?,
            provider_id: row.get(2)?,
            model_id: row.get(3)?,
            system_prompt: row.get(4)?,
            project_id: row.get(5)?,
            pinned: row.get::<_, i64>(6)? != 0,
            archived: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }

    fn map_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiProject> {
        Ok(AiProject {
            id: row.get(0)?,
            name: row.get(1)?,
            instructions: row.get(2)?,
            knowledge_library_id: row.get(3)?,
            knowledge_space_id: row.get(4)?,
            include_global_memory: row.get::<_, i64>(5)? != 0,
            archived: row.get::<_, i64>(6)? != 0,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }

    fn map_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiMemory> {
        Ok(AiMemory {
            id: row.get(0)?,
            scope: row.get(1)?,
            scope_id: row.get(2)?,
            content: row.get(3)?,
            source_message_id: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }

    fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiChatMessage> {
        Ok(AiChatMessage {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            status: row.get(4)?,
            parent_message_id: row.get(5)?,
            model_id: row.get(6)?,
            provider_id: row.get(7)?,
            token_usage_json: row.get(8)?,
            metadata_json: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }

    fn map_citation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCitation> {
        Ok(AiCitation {
            id: row.get(0)?,
            message_id: row.get(1)?,
            source_type: row.get(2)?,
            title: row.get(3)?,
            url: row.get(4)?,
            source_id: row.get(5)?,
            snippet: row.get(6)?,
            metadata_json: row.get(7)?,
            created_at: row.get(8)?,
        })
    }

    fn map_canvas_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasWorkspace> {
        Ok(AiCanvasWorkspace {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            title: row.get(2)?,
            mode: row.get(3)?,
            active_version_id: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }

    fn map_canvas_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasFile> {
        Ok(AiCanvasFile {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            path: row.get(2)?,
            language: row.get(3)?,
            content: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }

    fn map_canvas_version(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasVersion> {
        Ok(AiCanvasVersion {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            version_no: row.get(2)?,
            snapshot_json: row.get(3)?,
            source_message_id: row.get(4)?,
            created_at: row.get(5)?,
        })
    }

    fn map_canvas_operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasOperation> {
        Ok(AiCanvasOperation {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            source_message_id: row.get(2)?,
            operation_type: row.get(3)?,
            payload_json: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
        })
    }

    fn map_research_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiResearchJob> {
        Ok(AiResearchJob {
            id: row.get(0)?,
            title: row.get(1)?,
            query: row.get(2)?,
            status: row.get(3)?,
            stage: row.get(4)?,
            provider_id: row.get(5)?,
            model_id: row.get(6)?,
            progress: row.get(7)?,
            report_markdown: row.get(8)?,
            error_message: row.get(9)?,
            options_json: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            completed_at: row.get(13)?,
        })
    }

    fn map_research_source(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiResearchSource> {
        Ok(AiResearchSource {
            id: row.get(0)?,
            job_id: row.get(1)?,
            source_type: row.get(2)?,
            title: row.get(3)?,
            url: row.get(4)?,
            source_id: row.get(5)?,
            snippet: row.get(6)?,
            summary: row.get(7)?,
            metadata_json: row.get(8)?,
            created_at: row.get(9)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conversation_input(id: &str) -> CreateAiConversationInput {
        CreateAiConversationInput {
            id: id.to_string(),
            title: "New chat".to_string(),
            provider_id: "openai".to_string(),
            model_id: "gpt-test".to_string(),
            system_prompt: None,
            project_id: None,
        }
    }

    #[test]
    fn creates_conversation_and_messages() {
        let db = Database::new_in_memory().unwrap();
        let conversation =
            AiService::create_conversation(&db, conversation_input("conv-1")).unwrap();
        assert_eq!(conversation.id, "conv-1");

        AiService::insert_message(
            &db,
            CreateAiMessageInput {
                id: "msg-user".to_string(),
                conversation_id: "conv-1".to_string(),
                role: "user".to_string(),
                content: "hello".to_string(),
                status: "complete".to_string(),
                parent_message_id: None,
                model_id: None,
                provider_id: None,
                token_usage_json: None,
                metadata_json: None,
            },
        )
        .unwrap();

        AiService::insert_message(
            &db,
            CreateAiMessageInput {
                id: "msg-assistant".to_string(),
                conversation_id: "conv-1".to_string(),
                role: "assistant".to_string(),
                content: "hi".to_string(),
                status: "complete".to_string(),
                parent_message_id: Some("msg-user".to_string()),
                model_id: Some("gpt-test".to_string()),
                provider_id: Some("openai".to_string()),
                token_usage_json: None,
                metadata_json: None,
            },
        )
        .unwrap();

        let messages = AiService::list_messages(&db, "conv-1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn deleting_conversation_removes_messages() {
        let db = Database::new_in_memory().unwrap();
        AiService::create_conversation(&db, conversation_input("conv-2")).unwrap();
        AiService::insert_message(
            &db,
            CreateAiMessageInput {
                id: "msg-delete".to_string(),
                conversation_id: "conv-2".to_string(),
                role: "user".to_string(),
                content: "delete me".to_string(),
                status: "complete".to_string(),
                parent_message_id: None,
                model_id: None,
                provider_id: None,
                token_usage_json: None,
                metadata_json: None,
            },
        )
        .unwrap();

        AiService::delete_conversation(&db, "conv-2").unwrap();
        let messages = AiService::list_messages(&db, "conv-2").unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn creates_canvas_workspace_files_versions_and_operations() {
        let db = Database::new_in_memory().unwrap();
        AiService::create_conversation(&db, conversation_input("conv-canvas")).unwrap();

        let workspace = AiService::create_canvas_workspace(
            &db,
            CreateAiCanvasWorkspaceInput {
                id: "canvas-1".to_string(),
                conversation_id: "conv-canvas".to_string(),
                title: "Landing page".to_string(),
                mode: "html".to_string(),
            },
        )
        .unwrap();
        assert_eq!(workspace.mode, "html");

        let file = AiService::upsert_canvas_file(
            &db,
            UpsertAiCanvasFileInput {
                id: "file-1".to_string(),
                workspace_id: "canvas-1".to_string(),
                path: "index.html".to_string(),
                language: "html".to_string(),
                content: "<h1>Hello</h1>".to_string(),
            },
        )
        .unwrap();
        assert_eq!(file.path, "index.html");

        let version = AiService::create_canvas_version(
            &db,
            CreateAiCanvasVersionInput {
                id: "version-1".to_string(),
                workspace_id: "canvas-1".to_string(),
                version_no: 1,
                snapshot_json:
                    r#"{"files":[{"path":"index.html","content":"<h1>Hello</h1>"}]}"#
                        .to_string(),
                source_message_id: None,
            },
        )
        .unwrap();
        assert_eq!(version.version_no, 1);

        let operation = AiService::create_canvas_operation(
            &db,
            CreateAiCanvasOperationInput {
                id: "operation-1".to_string(),
                workspace_id: "canvas-1".to_string(),
                source_message_id: None,
                operation_type: "replace_file".to_string(),
                payload_json: r#"{"path":"index.html"}"#.to_string(),
                status: "applied".to_string(),
            },
        )
        .unwrap();
        assert_eq!(operation.status, "applied");

        assert_eq!(
            AiService::list_canvas_workspaces(&db, "conv-canvas")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(AiService::list_canvas_files(&db, "canvas-1").unwrap().len(), 1);
        assert_eq!(
            AiService::list_canvas_versions(&db, "canvas-1")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            AiService::list_canvas_operations(&db, "canvas-1")
                .unwrap()
                .len(),
            1
        );

        AiService::delete_conversation(&db, "conv-canvas").unwrap();
        assert!(
            AiService::list_canvas_workspaces(&db, "conv-canvas")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn creates_ai_projects_and_memories() {
        let db = Database::new_in_memory().unwrap();
        let project = AiService::create_project(
            &db,
            CreateAiProjectInput {
                id: "project-1".to_string(),
                name: "Writing".to_string(),
                instructions: Some("Use concise prose".to_string()),
                knowledge_library_id: None,
                knowledge_space_id: None,
                include_global_memory: true,
            },
        )
        .unwrap();
        assert_eq!(project.name, "Writing");

        let memory = AiService::create_memory(
            &db,
            CreateAiMemoryInput {
                id: "memory-1".to_string(),
                scope: "project".to_string(),
                scope_id: Some(project.id.clone()),
                content: "Prefer Chinese answers".to_string(),
                source_message_id: None,
                enabled: true,
            },
        )
        .unwrap();
        assert!(memory.enabled);

        let memories = AiService::list_memories(
            &db,
            Some(ListAiMemoriesInput {
                scope: Some("project".to_string()),
                scope_id: Some(project.id.clone()),
                enabled: Some(true),
                limit: Some(10),
            }),
        )
        .unwrap();
        assert_eq!(memories.len(), 1);

        let updated = AiService::update_memory(
            &db,
            &memory.id,
            UpdateAiMemoryInput {
                content: Some("Prefer short Chinese answers".to_string()),
                enabled: Some(false),
            },
        )
        .unwrap();
        assert!(!updated.enabled);

        AiService::delete_project(&db, &project.id).unwrap();
        assert!(AiService::list_projects(&db).unwrap().is_empty());
    }
}
