import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiEdit3, FiEye, FiFilm, FiImage, FiLink, FiPlus, FiTrash2, FiUploadCloud, FiX } from 'react-icons/fi';
import { formatImageFileSize } from '../../lib/backgroundImageFile';
import {
    BACKGROUND_MEDIA_LIBRARY_LIMIT,
    BACKGROUND_IMAGE_FORMAT_OPTIONS,
    BACKGROUND_MEDIA_RESOLUTION_OPTIONS,
    BACKGROUND_VIDEO_FORMAT_OPTIONS,
    createBackgroundMediaLink,
    getBackgroundMediaKind,
    validateBackgroundMediaFile,
    uploadBackgroundMediaFile
} from '../../lib/backgroundMediaLibrary';
import { showConfirm, showPrompt } from '../../stores/useDialogStore';
import { resolveApiAssetUrl } from '../../lib/connectionConfig';
import DropdownSelect from '../DropdownSelect';

const selectPatch = (media, library) => ({
    backgroundMode: 'media',
    backgroundImageUrl: media?.url || '',
    backgroundMediaType: media?.type || 'image',
    backgroundMediaId: media?.id || null,
    backgroundMediaLibrary: library
});

const BackgroundMediaPreview = ({ media }) => {
    const mediaUrl = resolveApiAssetUrl(media.url);
    if (media.type === 'video') {
        return (
            <video src={mediaUrl} muted playsInline preload="metadata" aria-hidden="true" />
        );
    }
    return <span style={{ backgroundImage: `url("${mediaUrl.replace(/"/g, '\\"')}")` }} aria-hidden="true" />;
};

const getMediaSize = (media, resolvedSizes) => {
    const persistedSize = Number(media?.size);
    if (Number.isFinite(persistedSize) && persistedSize > 0) return persistedSize;
    return resolvedSizes[media?.id] || 0;
};

const BackgroundMediaPreviewDialog = ({ media, size, selected, applying, onApply, onClose }) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!media) return null;
    const mediaUrl = resolveApiAssetUrl(media.url);
    const sourceLabel = media.source === 'upload' ? '设备文件' : '外部链接';

    return createPortal(
        <div className="background-media-preview-overlay" role="presentation" onMouseDown={onClose}>
            <section
                className="background-media-preview-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="background-media-preview-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="background-media-preview-dialog__header">
                    <div>
                        <span>{media.type === 'video' ? <FiFilm size={15} /> : <FiImage size={15} />}{media.type === 'video' ? '视频预览' : '图片预览'}</span>
                        <h3 id="background-media-preview-title">{media.name}</h3>
                        <p>{sourceLabel} · {size ? formatImageFileSize(size) : '大小未知'}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="关闭媒体预览" autoFocus><FiX size={20} /></button>
                </header>
                <div className="background-media-preview-dialog__media">
                    {media.type === 'video' ? (
                        <video src={mediaUrl} controls autoPlay loop muted playsInline preload="metadata" />
                    ) : (
                        <img src={mediaUrl} alt={media.name} />
                    )}
                </div>
                <footer className="background-media-preview-dialog__footer">
                    <p>{media.type === 'video' ? '预览视频默认静音，播放控制不会影响房间音频。' : '按原始比例完整显示，不裁切图片内容。'}</p>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>关闭</button>
                        <button type="button" className="btn btn-primary" onClick={onApply} disabled={selected || applying}>
                            {selected ? <FiCheck size={15} /> : null}
                            {selected ? '当前背景' : applying ? '正在应用…' : '设为背景'}
                        </button>
                    </div>
                </footer>
            </section>
        </div>,
        document.body
    );
};

const BackgroundMediaLibrary = ({ appearance, onCommit, saving = false }) => {
    const library = useMemo(() => (
        Array.isArray(appearance.backgroundMediaLibrary) ? appearance.backgroundMediaLibrary : []
    ), [appearance.backgroundMediaLibrary]);
    const [uploadState, setUploadState] = useState({ status: 'idle', message: '' });
    const [pendingFile, setPendingFile] = useState(null);
    const [uploadOptions, setUploadOptions] = useState({ resolution: '1080', quality: 80, format: 'webp' });
    const [linkDraft, setLinkDraft] = useState({ name: '', type: 'image', url: '' });
    const [previewMedia, setPreviewMedia] = useState(null);
    const [resolvedSizes, setResolvedSizes] = useState({});
    const pendingKind = pendingFile ? getBackgroundMediaKind(pendingFile) : 'image';
    const formatOptions = pendingKind === 'video' ? BACKGROUND_VIDEO_FORMAT_OPTIONS : BACKGROUND_IMAGE_FORMAT_OPTIONS;
    const isProcessing = uploadState.status === 'processing' || saving;

    useEffect(() => {
        const missingSizes = library.filter((media) => (
            media.source === 'upload'
            && !getMediaSize(media, resolvedSizes)
            && media.url
        ));
        if (!missingSizes.length) return undefined;

        const controller = new AbortController();
        Promise.all(missingSizes.map(async (media) => {
            try {
                const response = await fetch(resolveApiAssetUrl(media.url), {
                    method: 'HEAD',
                    credentials: 'include',
                    signal: controller.signal
                });
                const size = Number(response.headers.get('content-length'));
                return response.ok && Number.isFinite(size) && size > 0 ? [media.id, size] : null;
            } catch {
                return null;
            }
        })).then((entries) => {
            const nextEntries = entries.filter(Boolean);
            if (nextEntries.length) {
                setResolvedSizes((current) => ({ ...current, ...Object.fromEntries(nextEntries) }));
            }
        });
        return () => controller.abort();
    }, [library, resolvedSizes]);

    const commitPatch = async (patch) => {
        await onCommit(patch);
    };

    const selectMedia = async (media) => {
        if (isProcessing) return false;
        setUploadState({ status: 'processing', message: `正在切换到「${media.name}」…` });
        try {
            await commitPatch(selectPatch(media, library));
            setUploadState({ status: 'success', message: `已应用「${media.name}」并保存` });
            return true;
        } catch (error) {
            setUploadState({ status: 'error', message: error?.message || '背景切换失败，请重试' });
            return false;
        }
    };

    const handleFileSelection = (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file || isProcessing) return;
        if (library.length >= BACKGROUND_MEDIA_LIBRARY_LIMIT) {
            setUploadState({ status: 'error', message: `媒体库最多保存 ${BACKGROUND_MEDIA_LIBRARY_LIMIT} 项` });
            return;
        }
        try {
            validateBackgroundMediaFile(file);
            const kind = getBackgroundMediaKind(file);
            setPendingFile(file);
            setUploadOptions((prev) => ({ ...prev, format: kind === 'video' ? 'mp4' : 'webp' }));
            setUploadState({ status: 'idle', message: '' });
        } catch (error) {
            setUploadState({ status: 'error', message: error?.message || '媒体文件无法读取' });
        }
    };

    const handleUpload = async () => {
        if (!pendingFile || isProcessing) return;

        setUploadState({ status: 'processing', message: `正在处理并上传 ${pendingFile.name}…` });
        try {
            const media = await uploadBackgroundMediaFile(pendingFile, uploadOptions);
            const nextLibrary = [...library, media];
            await commitPatch(selectPatch(media, nextLibrary));
            setPendingFile(null);
            const detail = media.detail ? ` · ${media.detail}` : '';
            setUploadState({
                status: 'success',
                message: `${media.name}${detail} · ${formatImageFileSize(media.size)}，已应用并保存`
            });
        } catch (error) {
            setUploadState({ status: 'error', message: error?.message || '媒体文件处理失败，请重试' });
        }
    };

    const addLink = async () => {
        if (isProcessing) return;
        if (library.length >= BACKGROUND_MEDIA_LIBRARY_LIMIT) {
            setUploadState({ status: 'error', message: `媒体库最多保存 ${BACKGROUND_MEDIA_LIBRARY_LIMIT} 项` });
            return;
        }
        try {
            const media = createBackgroundMediaLink(linkDraft);
            const nextLibrary = [...library, media];
            setUploadState({ status: 'processing', message: `正在添加「${media.name}」…` });
            await commitPatch(selectPatch(media, nextLibrary));
            setLinkDraft({ name: '', type: 'image', url: '' });
            setUploadState({ status: 'success', message: `已添加并应用「${media.name}」` });
        } catch (error) {
            setUploadState({ status: 'error', message: error?.message || '链接格式不正确' });
        }
    };

    const renameMedia = async (media) => {
        const name = await showPrompt({
            title: '重命名背景',
            message: '输入便于识别的媒体名称。',
            defaultValue: media.name,
            confirmText: '保存名称',
            maxLength: 80
        });
        if (!name?.trim()) return;
        const nextLibrary = library.map((item) => (
            item.id === media.id ? { ...item, name: name.trim().slice(0, 80) } : item
        ));
        setUploadState({ status: 'processing', message: `正在保存「${name.trim()}」…` });
        try {
            await commitPatch({ backgroundMediaLibrary: nextLibrary });
            setUploadState({ status: 'success', message: `已重命名为「${name.trim()}」` });
        } catch (error) {
            setUploadState({ status: 'error', message: error?.message || '重命名保存失败，请重试' });
        }
    };

    const removeMedia = async (media) => {
        const confirmed = await showConfirm({
            title: '从媒体库删除',
            message: `确定删除「${media.name}」吗？本地上传的文件会在确认后立即清理。`,
            confirmText: '删除',
            danger: true
        });
        if (!confirmed) return;
        const nextLibrary = library.filter((item) => item.id !== media.id);
        if (appearance.backgroundMediaId === media.id || appearance.backgroundImageUrl === media.url) {
            const replacement = nextLibrary[0] || null;
            const patch = replacement ? selectPatch(replacement, nextLibrary) : {
                ...selectPatch(null, nextLibrary),
                backgroundMode: 'preset'
            };
            setUploadState({ status: 'processing', message: `正在删除「${media.name}」…` });
            try {
                await commitPatch(patch);
                setUploadState({ status: 'success', message: `已删除「${media.name}」` });
            } catch (error) {
                setUploadState({ status: 'error', message: error?.message || '删除保存失败，请重试' });
            }
        } else {
            setUploadState({ status: 'processing', message: `正在删除「${media.name}」…` });
            try {
                await commitPatch({ backgroundMediaLibrary: nextLibrary });
                setUploadState({ status: 'success', message: `已删除「${media.name}」` });
            } catch (error) {
                setUploadState({ status: 'error', message: error?.message || '删除保存失败，请重试' });
            }
        }
    };

    const previewSize = getMediaSize(previewMedia, resolvedSizes);
    const previewSelected = previewMedia && (
        appearance.backgroundMediaId === previewMedia.id
        || (!appearance.backgroundMediaId && appearance.backgroundImageUrl === previewMedia.url)
    );

    return (
        <>
        <div className="background-media-settings">
            <div className="background-media-import">
                <div className="background-media-import__icon" aria-hidden="true"><FiUploadCloud size={20} /></div>
                <div className="background-media-import__copy">
                    <strong>导入图片或循环视频</strong>
                    <p>选择文件后可设置输出分辨率、压缩质量和格式；视频最大 100 MB，播放时始终静音。</p>
                </div>
                <label className={`btn btn-secondary background-media-file-button ${isProcessing ? 'is-busy' : ''}`}>
                    <FiPlus size={15} />
                    {pendingFile ? '更换文件' : '选择文件'}
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/ogg"
                        disabled={isProcessing}
                        onChange={handleFileSelection}
                    />
                </label>
            </div>

            {pendingFile && (
                <div className={`background-media-upload-editor ${isProcessing ? 'is-processing' : ''}`}>
                    <div className="background-media-upload-editor__file">
                        <span aria-hidden="true">{pendingKind === 'video' ? <FiFilm size={18} /> : <FiImage size={18} />}</span>
                        <div>
                            <strong title={pendingFile.name}>{pendingFile.name}</strong>
                            <small>{pendingKind === 'video' ? '循环视频' : '背景图片'} · {formatImageFileSize(pendingFile.size)}</small>
                        </div>
                        <button type="button" onClick={() => setPendingFile(null)} disabled={isProcessing} aria-label="取消选择文件"><FiX size={16} /></button>
                    </div>

                    <div className="background-media-upload-editor__options">
                        <div className="background-media-upload-editor__field">
                            <span>输出分辨率</span>
                            <DropdownSelect
                                value={uploadOptions.resolution}
                                onChange={(resolution) => setUploadOptions((prev) => ({ ...prev, resolution }))}
                                options={BACKGROUND_MEDIA_RESOLUTION_OPTIONS}
                                ariaLabel="上传输出分辨率"
                                disabled={isProcessing}
                            />
                        </div>
                        <div className="background-media-upload-editor__field">
                            <span>压缩格式</span>
                            <DropdownSelect
                                value={uploadOptions.format}
                                onChange={(format) => setUploadOptions((prev) => ({ ...prev, format }))}
                                options={formatOptions}
                                ariaLabel="上传压缩格式"
                                disabled={isProcessing}
                            />
                        </div>
                        <label className="background-media-upload-editor__quality">
                            <span>压缩质量 <output>{uploadOptions.format === 'png' ? '无损' : `${uploadOptions.quality}%`}</output></span>
                            <input
                                type="range"
                                min="20"
                                max="100"
                                step="5"
                                value={uploadOptions.quality}
                                onChange={(event) => setUploadOptions((prev) => ({ ...prev, quality: Number(event.target.value) }))}
                                disabled={isProcessing || uploadOptions.format === 'png'}
                                className="settings-range-input"
                                aria-label="上传压缩质量"
                            />
                        </label>
                    </div>

                    <div className="background-media-upload-editor__actions">
                        <p>{uploadOptions.resolution === 'native' ? '保留原始尺寸' : `保持比例，最高输出 ${uploadOptions.resolution}p`}；{uploadOptions.format === 'png' ? 'PNG 使用无损压缩' : '数值越高画质越好、文件越大'}。</p>
                        <button type="button" className="btn btn-primary" onClick={() => void handleUpload()} disabled={isProcessing}>
                            <FiUploadCloud size={15} />
                            {isProcessing ? (pendingKind === 'video' ? '正在转码…' : '正在压缩…') : '处理并上传'}
                        </button>
                    </div>
                </div>
            )}

            {uploadState.message && (
                <p className={`background-media-status is-${uploadState.status}`} role="status" aria-live="polite">
                    {uploadState.message}
                </p>
            )}

            <div className="background-media-link-form">
                <div className="background-media-link-form__heading">
                    <FiLink size={15} />
                    <div><strong>添加媒体链接</strong><span>适合已托管的图片或可直播放的视频地址。</span></div>
                </div>
                <div className="background-media-link-form__fields">
                    <div className="background-media-link-form__identity">
                        <input
                            className="input"
                            value={linkDraft.name}
                            onChange={(event) => setLinkDraft((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="名称（可选）"
                            maxLength={80}
                        />
                        <DropdownSelect
                            className="background-media-link-form__type"
                            value={linkDraft.type}
                            onChange={(type) => setLinkDraft((prev) => ({ ...prev, type }))}
                            ariaLabel="链接媒体类型"
                            options={[
                                { value: 'image', label: '图片链接' },
                                { value: 'video', label: '视频链接' }
                            ]}
                        />
                    </div>
                    <div className="background-media-link-form__address">
                        <input
                            className="input background-media-link-form__url"
                            type="url"
                            value={linkDraft.url}
                            onChange={(event) => setLinkDraft((prev) => ({ ...prev, url: event.target.value }))}
                            placeholder="https://example.com/background.mp4"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addLink();
                                }
                            }}
                        />
                        <button type="button" className="btn btn-secondary" onClick={addLink} disabled={!linkDraft.url.trim()}>
                            添加
                        </button>
                    </div>
                </div>
            </div>

            <div className="background-media-library__header">
                <div><strong>媒体库</strong><span>{library.length}/{BACKGROUND_MEDIA_LIBRARY_LIMIT} · 点击缩略图预览，确认后再设为背景</span></div>
            </div>

            {library.length ? (
                <div className="background-media-library">
                    {library.map((media) => {
                        const selected = appearance.backgroundMediaId === media.id
                            || (!appearance.backgroundMediaId && appearance.backgroundImageUrl === media.url);
                        return (
                            <article key={media.id} className={`background-media-card ${selected ? 'is-selected' : ''}`}>
                                <button type="button" className="background-media-card__preview" onClick={() => setPreviewMedia(media)} aria-label={`预览 ${media.name}`}>
                                    <BackgroundMediaPreview media={media} />
                                    <span className="background-media-card__type">
                                        {media.type === 'video' ? <FiFilm size={13} /> : <FiImage size={13} />}
                                        {media.type === 'video' ? '视频' : '图片'}
                                    </span>
                                    {selected && <span className="background-media-card__selected"><FiCheck size={14} />使用中</span>}
                                    <span className="background-media-card__preview-action"><FiEye size={14} />预览</span>
                                </button>
                                <div className="background-media-card__meta">
                                    <div><strong title={media.name}>{media.name}</strong><span>{media.source === 'upload' ? '设备文件' : '外部链接'} · {getMediaSize(media, resolvedSizes) ? formatImageFileSize(getMediaSize(media, resolvedSizes)) : '大小未知'}</span></div>
                                    <div className="background-media-card__actions">
                                        <button type="button" onClick={() => void renameMedia(media)} aria-label={`重命名 ${media.name}`}><FiEdit3 size={14} /></button>
                                        <button type="button" onClick={() => void removeMedia(media)} aria-label={`删除 ${media.name}`}><FiTrash2 size={14} /></button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="background-media-library__empty">
                    <FiImage size={21} />
                    <div><strong>媒体库还是空的</strong><span>导入文件或添加链接后，就能在这里随时切换。</span></div>
                </div>
            )}
        </div>
        {previewMedia && (
            <BackgroundMediaPreviewDialog
                media={previewMedia}
                size={previewSize}
                selected={previewSelected}
                applying={isProcessing}
                onClose={() => setPreviewMedia(null)}
                onApply={async () => {
                    if (await selectMedia(previewMedia)) setPreviewMedia(null);
                }}
            />
        )}
        </>
    );
};

export default BackgroundMediaLibrary;
