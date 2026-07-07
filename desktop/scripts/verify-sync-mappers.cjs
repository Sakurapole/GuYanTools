const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appConfigMapperPath = path.join(root, 'src/main/sync/mappers/app_config_mapper.ts');
const knowledgeMapperPath = path.join(root, 'src/main/sync/mappers/knowledge_mapper.ts');
const aiMapperPath = path.join(root, 'src/main/sync/mappers/ai_mapper.ts');
const source = fs.readFileSync(appConfigMapperPath, 'utf8');

const required = [
  'exportAppConfigForSync',
  'sanitizeAppConfigForSync',
  'createAppConfigPatchFromSyncProfile',
  "'app.profile'",
  "'app.appearance'",
  "'app.bottom_bar'",
  "'app.shortcuts'",
  "'app.features'",
  "apiKey: undefined",
  "apiKeyRef: provider.apiKeyRef ? 'redacted' : undefined",
  "webSearchApiKey: undefined",
  "modelscopeApiToken: undefined",
  'customAssetDirectory: \'\',',
  'libreOfficePath: \'\',',
  'everythingEsPath: \'\',',
  'cwd: \'\'',
];

const missing = required.filter((token) => !source.includes(token));
if (missing.length > 0) {
  console.error(`Missing AppConfig sync mapper tokens: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Sync mapper surface verified.');

for (const file of [knowledgeMapperPath, aiMapperPath]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing sync mapper: ${path.relative(root, file)}`);
    process.exit(1);
  }
}

const knowledgeSource = fs.readFileSync(knowledgeMapperPath, 'utf8');
const knowledgeRequired = [
  'exportKnowledgeForSync',
  'pageDetails',
  'sanitizeKnowledgePageDetail',
  "'knowledge.library'",
  "'knowledge.space'",
  "'knowledge.folder'",
  "'knowledge.page'",
  "'knowledge.asset'",
  "'knowledge.tag'",
  "'knowledge.link'",
];
const missingKnowledge = knowledgeRequired.filter((token) => !knowledgeSource.includes(token));
if (missingKnowledge.length > 0) {
  console.error(`Missing Knowledge sync mapper tokens: ${missingKnowledge.join(', ')}`);
  process.exit(1);
}

const syncServiceSource = fs.readFileSync(path.join(root, 'src/main/sync/sync_service.ts'), 'utf8');
const syncServiceRequired = [
  'applyKnowledgeSyncObject',
  'sortRemoteObjectsForApply',
  'uploadPendingKnowledgeAssets',
  'createKnowledgeAssetRemoteKey',
];
const missingSyncService = syncServiceRequired.filter((token) => !syncServiceSource.includes(token));
if (missingSyncService.length > 0) {
  console.error(`Missing Knowledge sync apply/upload tokens: ${missingSyncService.join(', ')}`);
  process.exit(1);
}
const forbiddenKnowledgePayloadTokens = [
  'storagePath:',
  'originalPath:',
  'previewPath:',
  'thumbnailPath:',
];
const presentForbiddenKnowledgeTokens = forbiddenKnowledgePayloadTokens.filter((token) => knowledgeSource.includes(token));
if (presentForbiddenKnowledgeTokens.length > 0) {
  console.error(`Knowledge sync mapper appears to export local asset paths: ${presentForbiddenKnowledgeTokens.join(', ')}`);
  process.exit(1);
}

const aiSource = fs.readFileSync(aiMapperPath, 'utf8');
const aiRequired = [
  'exportAiConfigForSync',
  'sanitizeAiAssistantForSync',
  'sanitizeAiProviderForSync',
  'sanitizeAiModelForSync',
  "'ai.assistant'",
  "'ai.provider'",
  "'ai.model_config'",
  'needsConfiguration',
];
const missingAi = aiRequired.filter((token) => !aiSource.includes(token));
if (missingAi.length > 0) {
  console.error(`Missing AI sync mapper tokens: ${missingAi.join(', ')}`);
  process.exit(1);
}

const forbiddenAiPayloadTokens = [
  'apiKey:',
  'apiKeyRef:',
  'webSearchApiKey:',
  'modelscopeApiToken:',
  'value: item.value',
];
const presentForbiddenAiTokens = forbiddenAiPayloadTokens.filter((token) => aiSource.includes(token));
if (presentForbiddenAiTokens.length > 0) {
  console.error(`AI sync mapper appears to export secret fields: ${presentForbiddenAiTokens.join(', ')}`);
  process.exit(1);
}

console.log('Knowledge and AI sync mapper surfaces verified.');
