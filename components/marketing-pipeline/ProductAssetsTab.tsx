'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Film,
  File,
  ExternalLink,
  Trash2,
  Loader2,
  X,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { Tooltip } from 'antd';
import { fetchApi } from '@/lib/api/errorHandler';
import type { DriveFile } from '@/lib/server/googleDrive';
import styles from './ProductAssetsTab.module.css';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_CONCURRENT = 2;
const CLEAR_DONE_DELAY = 2000; // ms before completed items auto-clear

interface UploadItem {
  id: string;
  fileName: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  xhr?: XMLHttpRequest;
}

interface ProductAssetsTabProps {
  productId: string;
  driveFolderId?: string | null;
  assetsFolderId?: string | null;
  onAssetsFolderCreated?: (folderId: string) => void;
}

type FileCategory = 'all' | 'images' | 'documents' | 'videos' | 'other';

const CATEGORY_LABELS: Record<FileCategory, string> = {
  all: 'All',
  images: 'Images',
  documents: 'Documents',
  videos: 'Videos',
  other: 'Other',
};

function getFileCategory(mimeType: string): Exclude<FileCategory, 'all'> {
  if (mimeType.startsWith('image/')) return 'images';
  if (mimeType.startsWith('video/')) return 'videos';
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType.includes('text/')
  ) return 'documents';
  return 'other';
}

function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith('image/')) return <ImageIcon size={14} />;
  if (mimeType.startsWith('video/')) return <Film size={14} />;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text'))
    return <FileText size={14} />;
  return <File size={14} />;
}

function getTypeBadge(mimeType: string): string {
  if (mimeType.startsWith('image/')) {
    const sub = mimeType.split('/')[1]?.toUpperCase();
    return sub === 'JPEG' ? 'JPG' : (sub || 'IMG');
  }
  if (mimeType.startsWith('video/')) return mimeType.split('/')[1]?.toUpperCase() || 'VID';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'CSV';
  if (mimeType.includes('document') || mimeType.includes('msword')) return 'DOC';
  if (mimeType.includes('presentation')) return 'PPT';
  if (mimeType.includes('text/')) return 'TXT';
  if (mimeType.includes('json')) return 'JSON';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'ZIP';
  return 'FILE';
}

function formatFileSize(bytes: string | number): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(b) || b === 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fileDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - fileDay.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const GROUP_ORDER: Exclude<FileCategory, 'all'>[] = ['images', 'documents', 'videos', 'other'];

export function ProductAssetsTab({
  productId,
  driveFolderId,
  assetsFolderId: initialAssetsFolderId,
  onAssetsFolderCreated,
}: ProductAssetsTabProps): React.ReactNode {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [assetsFolderId, setAssetsFolderId] = useState(initialAssetsFolderId);
  const [filterCategory, setFilterCategory] = useState<FileCategory>('all');
  const [groupByType, setGroupByType] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);

  // Fetch existing files
  const loadFiles = useCallback(async () => {
    try {
      const data = await fetchApi<DriveFile[]>(
        `/api/marketing-pipeline/products/${productId}/assets`,
      );
      setFiles(data);
    } catch {
      // Silently fail — empty list shown
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Navigation prevention while uploading
  useEffect(() => {
    const hasActive = uploads.some(u => u.status === 'uploading' || u.status === 'queued');
    if (!hasActive) return;

    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploads]);

  // Auto-clear completed upload items after delay
  useEffect(() => {
    const doneItems = uploads.filter(u => u.status === 'done');
    if (doneItems.length === 0) return;

    const timer = setTimeout(() => {
      setUploads(prev => prev.filter(u => u.status !== 'done'));
    }, CLEAR_DONE_DELAY);
    return () => clearTimeout(timer);
  }, [uploads]);

  // Process upload queue
  const processQueue = useCallback(() => {
    while (activeUploadsRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      activeUploadsRef.current++;
      startUpload(item);
    }
  }, []);

  const startUpload = useCallback((item: UploadItem) => {
    const formData = new FormData();
    const fileEntry = (item as UploadItem & { _file?: globalThis.File })._file;
    if (!fileEntry) {
      setUploads(prev => prev.map(u =>
        u.id === item.id ? { ...u, status: 'error' as const, error: 'File reference lost' } : u,
      ));
      activeUploadsRef.current--;
      processQueue();
      return;
    }
    formData.append('file', fileEntry);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, progress: pct } : u,
        ));
      }
    });

    xhr.addEventListener('load', () => {
      activeUploadsRef.current--;
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          setUploads(prev => prev.map(u =>
            u.id === item.id ? { ...u, status: 'done' as const, progress: 100 } : u,
          ));
          if (json.assetsFolderId) {
            setAssetsFolderId(json.assetsFolderId);
            onAssetsFolderCreated?.(json.assetsFolderId);
          }
          loadFiles();
        } else {
          setUploads(prev => prev.map(u =>
            u.id === item.id ? { ...u, status: 'error' as const, error: json.error || 'Upload failed' } : u,
          ));
        }
      } catch {
        setUploads(prev => prev.map(u =>
          u.id === item.id ? { ...u, status: 'error' as const, error: 'Invalid server response' } : u,
        ));
      }
      processQueue();
    });

    xhr.addEventListener('error', () => {
      activeUploadsRef.current--;
      setUploads(prev => prev.map(u =>
        u.id === item.id ? { ...u, status: 'error' as const, error: 'Network error' } : u,
      ));
      processQueue();
    });

    xhr.open('POST', `/api/marketing-pipeline/products/${productId}/assets`);
    xhr.send(formData);

    setUploads(prev => prev.map(u =>
      u.id === item.id ? { ...u, status: 'uploading' as const, xhr } : u,
    ));
  }, [productId, loadFiles, processQueue, onAssetsFolderCreated]);

  const addFilesToQueue = useCallback((fileList: FileList | globalThis.File[]) => {
    const newItems: UploadItem[] = [];
    const filesToProcess = Array.from(fileList);

    for (const file of filesToProcess) {
      if (file.size > MAX_FILE_SIZE) {
        newItems.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fileName: file.name,
          progress: 0,
          status: 'error',
          error: 'File exceeds 25 MB limit',
        });
        continue;
      }

      const item: UploadItem & { _file?: globalThis.File } = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: file.name,
        progress: 0,
        status: 'queued',
        _file: file,
      };
      newItems.push(item);
      queueRef.current.push(item);
    }

    setUploads(prev => [...prev, ...newItems]);
    setTimeout(() => processQueue(), 0);
  }, [processQueue]);

  const dismissUpload = useCallback((uploadId: string) => {
    setUploads(prev => prev.filter(u => u.id !== uploadId));
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  }, [addFilesToQueue]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    }
  }, [addFilesToQueue]);

  const handleDelete = useCallback(async (fileId: string) => {
    if (!confirm('Delete this file? This cannot be undone.')) return;
    try {
      await fetchApi(`/api/marketing-pipeline/products/${productId}/assets/${fileId}`, {
        method: 'DELETE',
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch {
      // Error handled by fetchApi's global handler
    }
  }, [productId]);

  // Derived state
  const activeUploads = uploads.filter(u => u.status !== 'done');
  const hasActiveUploads = activeUploads.length > 0;

  // Filtering
  const filteredFiles = filterCategory === 'all'
    ? files
    : files.filter(f => getFileCategory(f.mimeType) === filterCategory);

  // Category counts (for filter chips)
  const categoryCounts: Record<FileCategory, number> = {
    all: files.length,
    images: 0, documents: 0, videos: 0, other: 0,
  };
  for (const f of files) categoryCounts[getFileCategory(f.mimeType)]++;

  // Available categories (only show chips that have files)
  const availableCategories: FileCategory[] = ['all', ...GROUP_ORDER.filter(c => categoryCounts[c] > 0)];

  // Grouping
  const groupedFiles: { category: Exclude<FileCategory, 'all'>; files: DriveFile[] }[] = [];
  if (groupByType) {
    for (const cat of GROUP_ORDER) {
      const group = filteredFiles.filter(f => getFileCategory(f.mimeType) === cat);
      if (group.length > 0) groupedFiles.push({ category: cat, files: group });
    }
  }

  // Render a single file row
  const renderFileRow = (file: DriveFile): React.ReactNode => {
    const isImage = file.mimeType.startsWith('image/');
    return (
      <div key={file.id} className={styles.fileRow}>
        <span className={isImage && file.thumbnailLink ? styles.thumbWrap : styles.fileIcon}>
          {isImage && file.thumbnailLink ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.thumbnailLink}
                alt=""
                className={styles.miniThumb}
                referrerPolicy="no-referrer"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://drive.google.com/thumbnail?id=${file.id}&sz=w400`}
                alt={file.name}
                className={styles.thumbPreview}
                referrerPolicy="no-referrer"
              />
            </>
          ) : (
            getFileIcon(file.mimeType)
          )}
        </span>
        <Tooltip title={file.name} mouseEnterDelay={0.3} placement="top">
          <span className={styles.fileName}>{file.name}</span>
        </Tooltip>
        <span className={styles.typeBadge}>{getTypeBadge(file.mimeType)}</span>
        <span className={styles.fileMeta}>{formatFileSize(file.size)}</span>
        <span className={styles.fileDate}>{formatRelativeDate(file.createdTime)}</span>
        <div className={styles.fileActions}>
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.fileActionBtn}
            title="Open in Drive"
          >
            <ExternalLink size={13} />
          </a>
          <button
            type="button"
            className={`${styles.fileActionBtn} ${styles.fileActionBtnDanger}`}
            onClick={() => handleDelete(file.id)}
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  if (!driveFolderId) {
    return (
      <div className={styles.emptyState}>
        <AlertCircle size={20} style={{ marginBottom: 8 }} />
        <div>No Drive folder set up for this product.</div>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={handleFileInput}
      />

      {/* Drop zone */}
      <div
        className={`${styles.dropZone} ${isDragOver ? styles.dropZoneDragOver : ''}`}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={24} className={styles.dropIcon} />
        <div className={styles.dropText}>
          Drag files here or <span className={styles.dropTextAccent}>click to browse</span>
        </div>
        <div className={styles.dropHint}>Max 25 MB per file</div>
      </div>

      {/* Active upload queue */}
      {hasActiveUploads && (
        <div className={styles.uploadList}>
          {activeUploads.map(item => (
            <div key={item.id} className={styles.uploadRow}>
              <span className={styles.uploadFileName}>{item.fileName}</span>

              {(item.status === 'uploading' || item.status === 'queued') && (
                <div className={styles.uploadProgress}>
                  <div
                    className={styles.uploadProgressBar}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              <span className={`${styles.uploadStatus} ${
                item.status === 'error' ? styles.uploadStatusError : styles.uploadStatusUploading
              }`}>
                {item.status === 'queued' && (
                  <Loader2 size={12} className={styles.uploadSpinner} />
                )}
                {item.status === 'uploading' && (
                  <>
                    <Loader2 size={12} className={styles.uploadSpinner} />
                    <span>{item.progress}%</span>
                  </>
                )}
                {item.status === 'error' && (
                  <>
                    <AlertCircle size={12} />
                    <span>{item.error}</span>
                    <button
                      type="button"
                      className={styles.uploadDismiss}
                      onClick={() => dismissUpload(item.id)}
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className={styles.fileSkeleton}>
          {[1, 2, 3].map(i => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonName} />
              <div className={styles.skeletonBadge} />
              <div className={styles.skeletonMeta} />
            </div>
          ))}
        </div>
      )}

      {/* Empty file list */}
      {!loading && files.length === 0 && !hasActiveUploads && (
        <div className={styles.emptyHint}>No files uploaded yet</div>
      )}

      {/* Toolbar: filter chips + group toggle */}
      {!loading && files.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.filterChips}>
            {availableCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`${styles.filterChip} ${filterCategory === cat ? styles.filterChipActive : ''}`}
                onClick={() => setFilterCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
                {cat !== 'all' && <span className={styles.filterChipCount}>{categoryCounts[cat]}</span>}
              </button>
            ))}
          </div>
          <div className={styles.toolbarRight}>
            <span className={styles.fileCount}>
              {filterCategory !== 'all' ? `${filteredFiles.length} of ${files.length}` : `${files.length}`} file{files.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className={`${styles.groupToggle} ${groupByType ? styles.groupToggleActive : ''}`}
              onClick={() => setGroupByType(prev => !prev)}
              title="Group by type"
            >
              <Layers size={13} />
            </button>
          </div>
        </div>
      )}

      {/* File list — unified rows */}
      {!loading && files.length > 0 && filteredFiles.length > 0 && (
        <div className={styles.fileList}>
          {groupByType ? (
            groupedFiles.map(group => (
              <div key={group.category}>
                <div className={styles.groupHeader}>
                  {CATEGORY_LABELS[group.category]}
                  <span className={styles.groupCount}>{group.files.length}</span>
                </div>
                {group.files.map(renderFileRow)}
              </div>
            ))
          ) : (
            filteredFiles.map(renderFileRow)
          )}
        </div>
      )}

      {/* Filtered to empty */}
      {!loading && files.length > 0 && filteredFiles.length === 0 && (
        <div className={styles.emptyHint}>No {CATEGORY_LABELS[filterCategory].toLowerCase()} found</div>
      )}
    </div>
  );
}
