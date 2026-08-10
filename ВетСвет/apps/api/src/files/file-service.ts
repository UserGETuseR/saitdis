import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type FileRecord = { id: UUID; organizationId: UUID; ownerId?: UUID; petId?: UUID; contentType: string; byteSize: number; checksum: string; originalName: string; state: 'PENDING_UPLOAD' | 'AVAILABLE' | 'QUARANTINED'; createdAt: ISODateTime };

/** Metadata boundary for private object storage. Upload bytes never pass through public URLs. */
export class FileService {
  readonly files = new Map<UUID, FileRecord>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  createUploadIntent(input: { originalName: string; contentType: string; byteSize: number; checksum: string; ownerId?: UUID; petId?: UUID }, meta: CommandMeta): FileRecord {
    this.access.require(meta.actor, 'pet:write');
    if (!input.originalName.trim() || !input.contentType.startsWith('image/') || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 15_000_000 || !/^[a-f0-9]{64}$/i.test(input.checksum)) throw new DomainError('VALIDATION', 'File metadata is invalid or exceeds the allowed private upload limit.');
    const now = meta.now ?? new Date();
    const file: FileRecord = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, originalName: input.originalName.trim(), contentType: input.contentType, byteSize: input.byteSize, checksum: input.checksum.toLowerCase(), state: 'PENDING_UPLOAD', createdAt: iso(now) };
    this.files.set(file.id, file);
    this.journal.record(meta, { action: 'file.upload_intent_created', aggregateType: 'File', aggregateId: file.id, metadata: { contentType: file.contentType, byteSize: file.byteSize } }, { eventName: 'file.upload_intent_created', aggregateType: 'File', aggregateId: file.id, payload: { petId: file.petId } }, now);
    return file;
  }

  markScanned(fileId: UUID, safe: boolean, meta: CommandMeta): FileRecord {
    this.access.require(meta.actor, 'pet:write');
    const file = this.files.get(fileId);
    if (!file || file.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'File is not available in this organization.');
    if (file.state !== 'PENDING_UPLOAD') throw new DomainError('CONFLICT', 'File was already processed.');
    file.state = safe ? 'AVAILABLE' : 'QUARANTINED';
    this.journal.record(meta, { action: safe ? 'file.scanned_safe' : 'file.quarantined', aggregateType: 'File', aggregateId: file.id, metadata: {} }, { eventName: safe ? 'file.scanned_safe' : 'file.quarantined', aggregateType: 'File', aggregateId: file.id, payload: { petId: file.petId } });
    return file;
  }
}
