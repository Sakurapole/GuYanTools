import { randomUUID } from 'node:crypto';
import { stat, readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type {
  AiChatAttachment,
  StageAiChatAttachmentPayload,
  StageAiChatAttachmentResult,
} from '@/contracts/ai';

const MAX_TEXT_ATTACHMENT_BYTES = 1_000_000;
const MAX_IMAGE_ATTACHMENT_BYTES = 6_000_000;

const TEXT_MIME_BY_EXTENSION = new Map<string, string>([
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.markdown', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.tsv', 'text/tab-separated-values'],
  ['.json', 'application/json'],
  ['.jsonl', 'application/jsonl'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml'],
  ['.xml', 'application/xml'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.css', 'text/css'],
  ['.scss', 'text/x-scss'],
  ['.js', 'text/javascript'],
  ['.jsx', 'text/javascript'],
  ['.ts', 'text/typescript'],
  ['.tsx', 'text/typescript'],
  ['.vue', 'text/x-vue'],
  ['.rs', 'text/x-rust'],
  ['.py', 'text/x-python'],
  ['.java', 'text/x-java-source'],
  ['.go', 'text/x-go'],
  ['.sql', 'application/sql'],
  ['.log', 'text/plain'],
]);

const IMAGE_MIME_BY_EXTENSION = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

class AiAttachmentService {
  async stageAttachment(input: StageAiChatAttachmentPayload): Promise<StageAiChatAttachmentResult> {
    const targetPath = input.path?.trim();
    if (!targetPath) {
      throw new Error('请选择要添加到 AI 对话的文件');
    }

    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      throw new Error('只能添加本地文件作为 AI 附件');
    }

    const extension = extname(targetPath).toLowerCase();
    const name = basename(targetPath);
    const textMimeType = TEXT_MIME_BY_EXTENSION.get(extension);
    if (textMimeType) {
      return {
        attachment: await this.stageTextFile(targetPath, {
          name,
          mimeType: textMimeType,
          size: fileStat.size,
          extension,
          source: input.source ?? 'local-file',
        }),
      };
    }

    const imageMimeType = IMAGE_MIME_BY_EXTENSION.get(extension);
    if (imageMimeType) {
      return {
        attachment: await this.stageImageFile(targetPath, {
          name,
          mimeType: imageMimeType,
          size: fileStat.size,
          extension,
          source: input.source ?? 'local-file',
        }),
      };
    }

    throw new Error(`暂不支持 ${extension || '未知'} 类型的 AI 附件`);
  }

  private async stageTextFile(
    targetPath: string,
    input: { name: string; mimeType: string; size: number; extension: string; source: AiChatAttachment['source'] },
  ): Promise<AiChatAttachment> {
    if (input.size > MAX_TEXT_ATTACHMENT_BYTES) {
      throw new Error(`文本附件不能超过 ${formatBytes(MAX_TEXT_ATTACHMENT_BYTES)}`);
    }

    const textContent = await readFile(targetPath, 'utf8');
    return {
      id: randomUUID(),
      kind: 'text',
      source: input.source,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      textContent,
      metadata: {
        extension: input.extension,
        stagedAt: Date.now(),
      },
    };
  }

  private async stageImageFile(
    targetPath: string,
    input: { name: string; mimeType: string; size: number; extension: string; source: AiChatAttachment['source'] },
  ): Promise<AiChatAttachment> {
    if (input.size > MAX_IMAGE_ATTACHMENT_BYTES) {
      throw new Error(`图片附件不能超过 ${formatBytes(MAX_IMAGE_ATTACHMENT_BYTES)}`);
    }

    const data = (await readFile(targetPath)).toString('base64');
    return {
      id: randomUUID(),
      kind: 'image',
      source: input.source,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      data,
      metadata: {
        extension: input.extension,
        stagedAt: Date.now(),
      },
    };
  }
}

function formatBytes(value: number) {
  return `${Math.round(value / 1_000_000)} MB`;
}

export const aiAttachmentService = new AiAttachmentService();
