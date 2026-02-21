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
  FolderOpen,
  CheckCircle2,
  Link2,
  Check,
  Minus,
  Download,
} from 'lucide-react';
import { App, Popconfirm, Tooltip } from 'antd';
import { fetchApi } from '@/lib/api/errorHandler';
import type { DriveFile } from '@/lib/server/googleDrive';
import styles from './ProductAssetsTab.module.css';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_CONCURRENT = 2;
const CLEAR_DONE_DELAY = 3000; // ms before completed items auto-clear

const ASSET_SUBFOLDERS = [
  { key: 'root', label: 'Assets' },
  { key: 'creatives', label: 'Creatives' },
  { key: 'research', label: 'Research' },
  { key: 'copy', label: 'Copy' },
  { key: 'landing-pages', label: 'Landing Pages' },
  { key: 'ideas', label: 'Ideas' },
] as const;

interface UploadItem {
  id: string;
  fileName: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  xhr?: XMLHttpRequest;
  folder?: string;
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

function generateScreenshotName(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `Screenshot_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.png`;
}

export function ProductAssetsTab({
  productId,
  driveFolderId,
  assetsFolderId: initialAssetsFolderId,
  onAssetsFolderCreated,
}: ProductAssetsTabProps): React.ReactNode {
  const { message } = App.useApp();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [assetsFolderId, setAssetsFolderId] = useState(initialAssetsFolderId);
  const [folderTab, setFolderTab] = useState('All');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Folder selection dialog state
  const [pendingFiles, setPendingFiles] = useState<globalThis.File[] | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  // Auto-clear completed upload items — only after ALL uploads finish
  useEffect(() => {
    if (uploads.length === 0) return;
    const allFinished = uploads.every(u => u.status === 'done' || u.status === 'error');
    if (!allFinished) return;
    if (!uploads.some(u => u.status === 'done')) return;

    const timer = setTimeout(() => {
      setUploads(prev => prev.filter(u => u.status !== 'done'));
    }, CLEAR_DONE_DELAY);
    return () => clearTimeout(timer);
  }, [uploads]);

  // Paste support — listen on document, only process when this tab is mounted
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!containerRef.current) return;
      // Only capture paste if the panel is visible (in the DOM)
      if (!document.contains(containerRef.current)) return;

      const clipFiles = e.clipboardData?.files;
      if (!clipFiles || clipFiles.length === 0) return;

      e.preventDefault();

      // Rename screenshot files that have generic names
      const processed: globalThis.File[] = [];
      for (const file of Array.from(clipFiles)) {
        if (file.type === 'image/png' && (!file.name || file.name === 'image.png')) {
          const renamed = new globalThis.File([file], generateScreenshotName(), { type: file.type });
          processed.push(renamed);
        } else {
          processed.push(file);
        }
      }

      setPendingFiles(processed);
    };

    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);

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
    if (item.folder && item.folder !== 'root') {
      formData.append('folder', item.folder === 'Assets' ? 'root' : item.folder);
    }

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

  const addFilesToQueue = useCallback((fileList: globalThis.File[], folderLabel?: string) => {
    const newItems: UploadItem[] = [];

    for (const file of fileList) {
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
        folder: folderLabel || 'root',
        _file: file,
      };
      newItems.push(item);
      queueRef.current.push(item);
    }

    setUploads(prev => [...prev, ...newItems]);
    setTimeout(() => processQueue(), 0);
  }, [processQueue]);

  // Stage files for folder selection (instead of uploading immediately)
  const stageFiles = useCallback((fileList: FileList | globalThis.File[]) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;
    setPendingFiles(filesArray);
  }, []);

  // Confirm folder selection and start upload
  const confirmFolderAndUpload = useCallback((folderLabel: string) => {
    if (!pendingFiles) return;
    addFilesToQueue(pendingFiles, folderLabel);
    setPendingFiles(null);
  }, [pendingFiles, addFilesToQueue]);

  const cancelPendingUpload = useCallback(() => {
    setPendingFiles(null);
  }, []);

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
      stageFiles(e.dataTransfer.files);
    }
  }, [stageFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      stageFiles(e.target.files);
      e.target.value = '';
    }
  }, [stageFiles]);

  const handleDelete = useCallback(async (fileId: string) => {
    await fetchApi(`/api/marketing-pipeline/products/${productId}/assets/${fileId}`, {
      method: 'DELETE',
    });
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, [productId]);

  // Selection handlers
  const hasSelection = selectedIds.size > 0;

  const toggleSelect = useCallback((fileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const fileId of ids) {
      try {
        await fetchApi(`/api/marketing-pipeline/products/${productId}/assets/${fileId}`, {
          method: 'DELETE',
        });
        deleted++;
        setFiles(prev => prev.filter(f => f.id !== fileId));
      } catch {
        // Continue deleting remaining files
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    message.success(`Deleted ${deleted} file${deleted !== 1 ? 's' : ''}`);
  }, [selectedIds, productId, message]);

  const handleCopyLinks = useCallback(() => {
    const links = files
      .filter(f => selectedIds.has(f.id))
      .map(f => f.webViewLink)
      .filter(Boolean);
    if (links.length === 0) return;
    navigator.clipboard.writeText(links.join('\n'));
    message.success(`Copied ${links.length} link${links.length !== 1 ? 's' : ''}`);
    setSelectedIds(new Set());
  }, [selectedIds, files, message]);

  const triggerDownload = useCallback((fileId: string) => {
    // Use hidden iframe — browsers block multiple <a>.click() calls but allow iframe src
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `/api/marketing-pipeline/products/${productId}/assets/${fileId}`;
    document.body.appendChild(iframe);
    // Clean up after download starts
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* already removed */ }
    }, 60_000);
  }, [productId]);

  const handleBulkDownload = useCallback(async () => {
    const ids = files
      .filter(f => selectedIds.has(f.id))
      .map(f => f.id);
    if (ids.length === 0) return;
    // Stagger iframe downloads to avoid overwhelming the browser
    for (let i = 0; i < ids.length; i++) {
      triggerDownload(ids[i]);
      if (i < ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    message.success(`Downloading ${ids.length} file${ids.length !== 1 ? 's' : ''}`);
    setSelectedIds(new Set());
  }, [selectedIds, files, triggerDownload, message]);

  // Derived state — uploads includes done items (shown briefly before auto-clear)
  const hasUploads = uploads.length > 0;

  // Folder tabs — derive from actual file data
  const folderNames = Array.from(new Set(files.map(f => f.folder || 'Assets')));
  const allFolderTabs = ['All', ...folderNames.sort((a, b) => {
    if (a === 'Assets') return -1;
    if (b === 'Assets') return 1;
    return a.localeCompare(b);
  })];

  // Filter by folder tab
  const folderFiltered = folderTab === 'All'
    ? files
    : files.filter(f => (f.folder || 'Assets') === folderTab);

  // Category filter within folder
  const [filterCategory, setFilterCategory] = useState<FileCategory>('all');
  const filteredFiles = filterCategory === 'all'
    ? folderFiltered
    : folderFiltered.filter(f => getFileCategory(f.mimeType) === filterCategory);

  // Clear selection when folder tab or filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [folderTab, filterCategory]);

  // Selection derived state
  const isAllSelected = filteredFiles.length > 0 && filteredFiles.every(f => selectedIds.has(f.id));
  const isSomeSelected = filteredFiles.some(f => selectedIds.has(f.id)) && !isAllSelected;

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFiles.map(f => f.id)));
    }
  }, [isAllSelected, filteredFiles]);

  // Category counts
  const categoryCounts: Record<FileCategory, number> = {
    all: folderFiltered.length,
    images: 0, documents: 0, videos: 0, other: 0,
  };
  for (const f of folderFiltered) categoryCounts[getFileCategory(f.mimeType)]++;
  const availableCategories: FileCategory[] = ['all', ...(['images', 'documents', 'videos', 'other'] as const).filter(c => categoryCounts[c] > 0)];

  // Render a single file row
  const renderFileRow = (file: DriveFile): React.ReactNode => {
    const isImage = file.mimeType.startsWith('image/');
    const isSelected = selectedIds.has(file.id);
    return (
      <div
        key={file.id}
        className={`${styles.fileRow} ${isSelected ? styles.fileRowSelected : ''} ${hasSelection ? styles.fileRowSelectable : ''}`}
      >
        <button
          type="button"
          className={`${styles.rowCheckbox} ${isSelected ? styles.rowCheckboxChecked : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleSelect(file.id); }}
          aria-label={isSelected ? 'Deselect file' : 'Select file'}
        >
          {isSelected && <Check size={10} strokeWidth={3} />}
        </button>
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
        {folderTab === 'All' && file.folder && file.folder !== 'Assets' && (
          <span className={styles.folderBadge}>
            <FolderOpen size={10} />
            {file.folder}
          </span>
        )}
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
            className={styles.fileActionBtn}
            title="Download"
            onClick={() => triggerDownload(file.id)}
          >
            <Download size={13} />
          </button>
          <Popconfirm
            title="Delete this file?"
            description="This cannot be undone. Are you sure?"
            onConfirm={() => handleDelete(file.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <button
              type="button"
              className={`${styles.fileActionBtn} ${styles.fileActionBtnDanger}`}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </Popconfirm>
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
      ref={containerRef}
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

      {/* Top area — three mutually exclusive states */}
      {hasUploads ? (
        /* Upload progress / success */
        uploads.every(u => u.status === 'done' || u.status === 'error') && uploads.some(u => u.status === 'done') ? (
          /* All finished — success celebration */
          <div className={styles.uploadSuccess}>
            <div className={styles.confettiField}>
              {Array.from({ length: 36 }).map((_, i) => (
                <span key={i} className={styles.confettiPiece} style={{
                  left: `${2 + ((i * 2.7) % 96)}%`,
                  animationDelay: `${(i * 47) % 500}ms`,
                  animationDuration: `${1000 + (i * 53) % 600}ms`,
                }} />
              ))}
            </div>
            <CheckCircle2 size={28} className={styles.successIcon} />
            <span className={styles.successText}>
              {uploads.filter(u => u.status === 'done').length} file{uploads.filter(u => u.status === 'done').length !== 1 ? 's' : ''} uploaded
            </span>
          </div>
        ) : (
          /* In-progress upload rows */
          <div className={styles.uploadList}>
            {uploads.map(item => (
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
                  item.status === 'done' ? styles.uploadStatusDone
                    : item.status === 'error' ? styles.uploadStatusError
                    : styles.uploadStatusUploading
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
                  {item.status === 'done' && (
                    <>
                      <CheckCircle2 size={12} />
                      <span>Done</span>
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
        )
      ) : pendingFiles ? (
        /* Folder selection */
        <div className={styles.folderDialog}>
          <div className={styles.folderDialogHeader}>
            <span className={styles.folderDialogTitle}>
              Upload {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} to:
            </span>
            <button
              type="button"
              className={styles.folderDialogClose}
              onClick={cancelPendingUpload}
            >
              <X size={14} />
            </button>
          </div>
          <div className={styles.folderOptions}>
            {ASSET_SUBFOLDERS.map(folder => (
              <button
                key={folder.key}
                type="button"
                className={styles.folderOption}
                onClick={() => confirmFolderAndUpload(folder.label)}
              >
                <FolderOpen size={14} />
                {folder.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Drop zone */
        <div
          className={`${styles.dropZone} ${isDragOver ? styles.dropZoneDragOver : ''}`}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={24} className={styles.dropIcon} />
          <div className={styles.dropText}>
            Drag files here, <span className={styles.dropTextAccent}>click to browse</span>, or paste from clipboard
          </div>
          <div className={styles.dropHint}>Max 25 MB per file</div>
        </div>
      )}

      {/* File listing section — whiteBox card */}
      {loading && (
        <div className={styles.fileSection}>
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
        </div>
      )}

      {!loading && files.length === 0 && !hasUploads && (
        <div className={styles.emptyHint}>No files uploaded yet</div>
      )}

      {!loading && files.length > 0 && (
        <div className={styles.fileSection}>
          {/* Folder tabs — underline style */}
          {allFolderTabs.length > 2 && (
            <div className={styles.folderTabs}>
              {allFolderTabs.map(tab => {
                const count = tab === 'All' ? files.length : files.filter(f => (f.folder || 'Assets') === tab).length;
                return (
                  <button
                    key={tab}
                    type="button"
                    className={`${styles.folderTabBtn} ${folderTab === tab ? styles.folderTabBtnActive : ''}`}
                    onClick={() => { setFolderTab(tab); setFilterCategory('all'); }}
                  >
                    {tab !== 'All' && <FolderOpen size={12} />}
                    {tab}
                    <span className={styles.folderTabCount}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Toolbar: filter chips or bulk action bar */}
          <div className={`${styles.toolbar} ${hasSelection ? styles.toolbarSelection : ''}`}>
            {hasSelection ? (
              <>
                <div className={styles.bulkLeft}>
                  <button
                    type="button"
                    className={`${styles.rowCheckbox} ${isAllSelected ? styles.rowCheckboxChecked : ''} ${isSomeSelected ? styles.rowCheckboxIndeterminate : ''}`}
                    onClick={toggleSelectAll}
                    aria-label={isAllSelected ? 'Deselect all' : 'Select all'}
                  >
                    {isAllSelected && <Check size={10} strokeWidth={3} />}
                    {isSomeSelected && <Minus size={10} strokeWidth={3} />}
                  </button>
                  <span className={styles.bulkCount}>
                    {selectedIds.size} selected
                  </span>
                </div>
                <div className={styles.bulkActions}>
                  <button
                    type="button"
                    className={styles.bulkActionBtn}
                    onClick={handleBulkDownload}
                    title="Download files"
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    className={styles.bulkActionBtn}
                    onClick={handleCopyLinks}
                    title="Copy Drive links"
                  >
                    <Link2 size={13} />
                    <span>Copy links</span>
                  </button>
                  <Popconfirm
                    title={`Delete ${selectedIds.size} file${selectedIds.size !== 1 ? 's' : ''}?`}
                    description="This cannot be undone."
                    onConfirm={handleBulkDelete}
                    okText="Delete"
                    okButtonProps={{ danger: true, loading: bulkDeleting }}
                  >
                    <button
                      type="button"
                      className={`${styles.bulkActionBtn} ${styles.bulkActionBtnDanger}`}
                      disabled={bulkDeleting}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </Popconfirm>
                  <button
                    type="button"
                    className={styles.bulkClearBtn}
                    onClick={clearSelection}
                    title="Clear selection"
                  >
                    <X size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    {filterCategory !== 'all' ? `${filteredFiles.length} of ${folderFiltered.length}` : `${folderFiltered.length}`} file{folderFiltered.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* File rows */}
          {filteredFiles.length > 0 ? (
            <div className={styles.fileList}>
              {filteredFiles.map(renderFileRow)}
            </div>
          ) : (
            <div className={styles.emptyHint}>No {CATEGORY_LABELS[filterCategory].toLowerCase()} found</div>
          )}
        </div>
      )}
    </div>
  );
}
