import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Database, ChevronRight, CheckCircle, Boxes, Sparkles, AlertCircle, ExternalLink, Plus, X, HelpCircle } from 'lucide-react';
import './App.css';

type Step = 'upload' | 'tech-info' | 'generating' | 'finished' | 'error';

interface EnvironmentData {
  name: string;
  images: File[];
  mdfColor: string;
  hingeType: string;
  slideType: string;
  thickness: string;
}

interface ImagePreview {
  file: File;
  url: string;
}

const N8N_WEBHOOK = import.meta.env.VITE_N8N_WEBHOOK as string;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const PROGRESS_MESSAGES = [
  'Analisando imagens do Promob...',
  'Gerando estilo visual com IA...',
  'Renderizando ambientes com Gemini...',
  'Aplicando materiais e iluminação...',
  'Consolidando renders...',
  'Criando apresentação no Canva...',
  'Finalizando e montando link...',
];

const DRAFT_KEY = 'fluxo_draft';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      // 5xx → retentar; 4xx → não retentar
      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return response;
    } catch (err) {
      // AbortError (timeout) → não retentar
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (attempt < maxRetries) {
        await sleep(2000 * (attempt + 1));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Falha após múltiplas tentativas.');
}

function classifyError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError')
    return 'O processamento demorou mais de 6 minutos. Tente novamente ou entre em contato com o suporte.';
  if (err instanceof TypeError)
    return 'Sem conexão com o servidor de renderização. Verifique sua internet e tente novamente.';
  if (err instanceof Error && /5\d\d/.test(err.message))
    return 'Erro interno no servidor de renderização. Tente novamente em alguns minutos.';
  if (err instanceof Error) return err.message;
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function App() {
  const [step, setStep] = useState<Step>('upload');
  const [envData, setEnvData] = useState<EnvironmentData>({
    name: '',
    images: [],
    mdfColor: '',
    hingeType: 'Standard',
    slideType: 'Telescópica',
    thickness: '15mm',
  });
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
  const [promptMaster, setPromptMaster] = useState('Moderno, iluminação natural, texturas realistas');
  const [canvaLink, setCanvaLink] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Progresso na geração
  const [progressMsgIndex, setProgressMsgIndex] = useState(0);
  const [msgFading, setMsgFading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restaurar rascunho do localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        setEnvData((prev) => ({
          ...prev,
          name: draft.name ?? prev.name,
          mdfColor: draft.mdfColor ?? prev.mdfColor,
          hingeType: draft.hingeType ?? prev.hingeType,
          slideType: draft.slideType ?? prev.slideType,
          thickness: draft.thickness ?? prev.thickness,
        }));
        if (draft.promptMaster) setPromptMaster(draft.promptMaster);
      }
    } catch {
      // ignorar erros de parsing
    }
  }, []);

  // ── Salvar rascunho no localStorage ──
  useEffect(() => {
    try {
      const draft = {
        name: envData.name,
        mdfColor: envData.mdfColor,
        hingeType: envData.hingeType,
        slideType: envData.slideType,
        thickness: envData.thickness,
        promptMaster,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignorar
    }
  }, [envData.name, envData.mdfColor, envData.hingeType, envData.slideType, envData.thickness, promptMaster]);

  // ── Timers de progresso ──
  const startProgressTimers = useCallback(() => {
    setProgressMsgIndex(0);
    setElapsedSeconds(0);

    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    progressIntervalRef.current = setInterval(() => {
      setMsgFading(true);
      setTimeout(() => {
        setProgressMsgIndex((i) => (i + 1) % PROGRESS_MESSAGES.length);
        setMsgFading(false);
      }, 500);
    }, 8000);
  }, []);

  const stopProgressTimers = useCallback(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
  }, []);

  useEffect(() => {
    return () => stopProgressTimers();
  }, [stopProgressTimers]);

  // ── Adicionar imagens com validação ──
  const addImages = (files: FileList | null) => {
    if (!files) return;
    const warnings: string[] = [];
    const validFiles: File[] = [];

    Array.from(files).forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        warnings.push(`"${file.name}" não é um formato suportado (use JPG, PNG ou WebP).`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        warnings.push(`"${file.name}" excede 5MB e foi ignorado.`);
        return;
      }
      validFiles.push(file);
    });

    setUploadWarnings(warnings);

    if (validFiles.length > 0) {
      const newPreviews = validFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }));
      setImagePreviews((prev) => [...prev, ...newPreviews]);
      setEnvData((prev) => ({ ...prev, images: [...prev.images, ...validFiles] }));
      // Limpar erro de imagens se agora há imagens
      if (validationErrors.images) {
        setValidationErrors((prev) => { const next = { ...prev }; delete next.images; return next; });
      }
    }
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index].url);
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setEnvData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleNext = async () => {
    if (step === 'upload') {
      const errors: Record<string, string> = {};
      if (!envData.name.trim()) {
        errors.name = 'Informe o nome do ambiente antes de continuar.';
      }
      if (envData.images.length === 0) {
        errors.images = 'Adicione pelo menos uma imagem do Promob.';
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }
      setValidationErrors({});
      setStep('tech-info');
      return;
    }

    if (step === 'tech-info') {
      setStep('generating');
      setErrorMessage('');
      startProgressTimers();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 360_000); // 6 min

      try {
        const imagesBase64 = await Promise.all(
          envData.images.map(async (file) => ({
            name: file.name,
            mimeType: file.type,
            data: await fileToBase64(file),
          }))
        );

        const payload = {
          environment: envData.name,
          style: promptMaster,
          mdfColor: envData.mdfColor,
          hingeType: envData.hingeType,
          slideType: envData.slideType,
          thickness: envData.thickness,
          images: imagesBase64,
        };

        const response = await fetchWithRetry(
          N8N_WEBHOOK,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        setCanvaLink(result.canva_link || result.link || '');
        stopProgressTimers();
        setStep('finished');
      } catch (err) {
        clearTimeout(timeoutId);
        stopProgressTimers();
        console.error('Erro ao processar:', err);
        setErrorMessage(classifyError(err));
        setStep('error');
      }
    }
  };

  const resetApp = () => {
    // Revogar todas as URLs de preview
    imagePreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setImagePreviews([]);
    setEnvData({ name: '', images: [], mdfColor: '', hingeType: 'Standard', slideType: 'Telescópica', thickness: '15mm' });
    setPromptMaster('Moderno, iluminação natural, texturas realistas');
    setCanvaLink('');
    setErrorMessage('');
    setValidationErrors({});
    setUploadWarnings([]);
    localStorage.removeItem(DRAFT_KEY);
    setStep('upload');
  };

  const stepNumber = step === 'upload' ? 1 : step === 'tech-info' ? 2 : 3;
  const estimatedMinutes = Math.max(1, Math.ceil((envData.images.length * 45) / 60));

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <Boxes size={28} className="logo-icon" aria-hidden="true" />
          <h1 className="gradient-text">Fluxo Render</h1>
        </div>
        <nav className="status-nav" aria-label="Etapas do processo">
          {['Ambientes', 'Dados Técnicos', 'Renderização'].map((label, i) => (
            <div
              key={label}
              className={`nav-item ${stepNumber === i + 1 ? 'active' : stepNumber > i + 1 ? 'done' : ''}`}
              aria-current={stepNumber === i + 1 ? 'step' : undefined}
            >
              <span className="nav-dot" aria-hidden="true">{stepNumber > i + 1 ? '✓' : i + 1}</span>
              {label}
            </div>
          ))}
        </nav>
      </header>

      <main className="main">
        {/* ── STEP 1: Upload ── */}
        {step === 'upload' && (
          <section className="glass-card wizard-step fade-in" aria-labelledby="step1-title">
            <div className="step-icon-wrap"><Sparkles size={40} className="icon-accent" aria-hidden="true" /></div>
            <h2 id="step1-title">Carregue as imagens do ambiente</h2>
            <p className="text-muted">Defina o nome do ambiente e suba as capturas do Promob para gerar os renders.</p>

            <div className="form-group">
              <label htmlFor="env-name">
                Nome do Ambiente
                <span className="required-star" aria-hidden="true"> *</span>
              </label>
              <input
                id="env-name"
                type="text"
                className={`input-field ${validationErrors.name ? 'has-error' : ''}`}
                placeholder="Ex: Cozinha Principal, Suite Master..."
                value={envData.name}
                required
                aria-required="true"
                aria-describedby={validationErrors.name ? 'name-error' : undefined}
                onChange={(e) => {
                  setEnvData({ ...envData, name: e.target.value });
                  if (validationErrors.name) setValidationErrors((prev) => { const next = { ...prev }; delete next.name; return next; });
                }}
              />
              {validationErrors.name && (
                <span id="name-error" className="field-error" role="alert">{validationErrors.name}</span>
              )}
            </div>

            <div
              className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Clique ou arraste imagens para fazer upload"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? fileInputRef.current?.click() : null}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); addImages(e.dataTransfer.files); }}
            >
              <Camera size={36} className="text-muted" aria-hidden="true" />
              <p>Arraste ou clique para adicionar imagens do Promob</p>
              <span className="upload-hint">JPG, PNG, WebP — até 5MB por imagem</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="file-input"
                aria-label="Selecionar imagens"
                onChange={(e) => addImages(e.target.files)}
              />
            </div>

            {/* Avisos de arquivos rejeitados */}
            {uploadWarnings.length > 0 && (
              <div className="upload-warnings" role="alert" aria-live="polite">
                {uploadWarnings.map((w, i) => (
                  <p key={i} className="upload-error">
                    <AlertCircle size={14} aria-hidden="true" /> {w}
                  </p>
                ))}
              </div>
            )}

            {/* Erro de validação de imagens */}
            {validationErrors.images && (
              <span className="field-error" role="alert">{validationErrors.images}</span>
            )}

            {/* Grid de thumbnails */}
            {imagePreviews.length > 0 && (
              <div className="thumb-grid" role="list" aria-label="Imagens selecionadas">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="thumb-item" role="listitem">
                    <img src={preview.url} alt={preview.file.name} />
                    <div className="thumb-overlay">
                      <button
                        className="remove-btn-overlay"
                        onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                        aria-label={`Remover ${preview.file.name}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="thumb-add-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Adicionar mais imagens"
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleNext}
              disabled={!envData.name.trim()}
              aria-disabled={!envData.name.trim()}
            >
              Próximo Passo <ChevronRight size={18} aria-hidden="true" />
            </button>
          </section>
        )}

        {/* ── STEP 2: Tech Info ── */}
        {step === 'tech-info' && (
          <section className="glass-card wizard-step fade-in" aria-labelledby="step2-title">
            <div className="step-icon-wrap"><Database size={40} className="icon-accent" aria-hidden="true" /></div>
            <h2 id="step2-title">Detalhes Técnicos</h2>
            <p className="text-muted">Essas informações geram o render e preenchem a apresentação automaticamente.</p>

            <div className="grid-form">
              <div className="form-group col-span-2">
                <label htmlFor="visual-style">
                  Estilo Visual da Renderização
                  <span className="help-icon" title="Descreva o estilo desejado para o ambiente: moderno, clássico, rústico, escandinavo, etc.">
                    <HelpCircle size={13} aria-hidden="true" />
                  </span>
                </label>
                <input
                  id="visual-style"
                  type="text"
                  className="input-field"
                  value={promptMaster}
                  onChange={(e) => setPromptMaster(e.target.value)}
                  placeholder="Ex: Minimalista, Escandinavo, Luxo contemporâneo..."
                  aria-describedby="visual-style-hint"
                />
                <span id="visual-style-hint" className="field-hint">Descreva o estilo desejado: moderno, clássico, rústico, etc.</span>
              </div>

              <div className="form-group">
                <label htmlFor="mdf-color">Cor do MDF</label>
                <input
                  id="mdf-color"
                  type="text"
                  className="input-field"
                  placeholder="Ex: Louro Freijó, Off-White..."
                  value={envData.mdfColor}
                  onChange={(e) => setEnvData({ ...envData, mdfColor: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="mdf-thickness">Espessura do MDF</label>
                <select
                  id="mdf-thickness"
                  className="input-field"
                  value={envData.thickness}
                  onChange={(e) => setEnvData({ ...envData, thickness: e.target.value })}
                >
                  <option>15mm</option>
                  <option>18mm</option>
                  <option>25mm</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="hinge-type">Tipo de Dobradiça</label>
                <select
                  id="hinge-type"
                  className="input-field"
                  value={envData.hingeType}
                  onChange={(e) => setEnvData({ ...envData, hingeType: e.target.value })}
                >
                  <option>Standard</option>
                  <option>Com Amortecimento</option>
                  <option>Invisível</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="slide-type">Tipo de Corrediça</label>
                <select
                  id="slide-type"
                  className="input-field"
                  value={envData.slideType}
                  onChange={(e) => setEnvData({ ...envData, slideType: e.target.value })}
                >
                  <option>Telescópica</option>
                  <option>Oculta (Undermount)</option>
                  <option>Push-to-open</option>
                </select>
              </div>
            </div>

            <div className="btn-row">
              <button className="btn-secondary" onClick={() => setStep('upload')}>← Voltar</button>
              <button
                className="btn-primary"
                onClick={handleNext}
              >
                Gerar Render & Apresentação <Sparkles size={18} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 3: Generating ── */}
        {step === 'generating' && (
          <div className="generating-overlay fade-in" role="status" aria-live="polite" aria-busy="true">
            <div className="spinner-ring" aria-hidden="true" />
            <h3>Processando com IA...</h3>
            <p className="text-muted">
              Ambiente <strong>"{envData.name}"</strong> · {envData.images.length} imagem{envData.images.length !== 1 ? 'ns' : ''}
            </p>
            <p className={`progress-message ${msgFading ? 'fading' : ''}`}>
              {PROGRESS_MESSAGES[progressMsgIndex]}
            </p>
            <div className="time-info">
              <span>⏱ {formatElapsed(elapsedSeconds)} decorrido</span>
              <span>· estimativa ~{estimatedMinutes} min</span>
            </div>
            <p className="text-muted-sm keep-tab-warning">
              ⚠ Não feche esta aba enquanto o processamento estiver em andamento.
            </p>
          </div>
        )}

        {/* ── STEP 4: Finished ── */}
        {step === 'finished' && (
          <section className="glass-card wizard-step fade-in" aria-labelledby="finished-title">
            <div className="step-icon-wrap"><CheckCircle size={56} className="icon-success" aria-hidden="true" /></div>
            <h2 id="finished-title">Apresentação pronta!</h2>
            <p className="text-muted">
              Os renders do ambiente <strong>"{envData.name}"</strong> foram gerados e a apresentação foi criada no Canva com as especificações técnicas.
            </p>

            <div className="btn-row centered">
              {canvaLink ? (
                <a href={canvaLink} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  Abrir no Canva <ExternalLink size={16} aria-hidden="true" />
                </a>
              ) : (
                <p className="text-muted-sm">Link da apresentação não retornado. Tente novamente.</p>
              )}
              <button className="btn-secondary" onClick={resetApp}>Novo Ambiente</button>
            </div>
          </section>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <section className="glass-card wizard-step fade-in error-card" aria-labelledby="error-title" role="alert">
            <div className="step-icon-wrap"><AlertCircle size={56} className="icon-error" aria-hidden="true" /></div>
            <h2 id="error-title">Algo deu errado</h2>
            <p className="text-muted">{errorMessage}</p>
            <p className="text-muted-sm">Se o problema persistir, entre em contato com o suporte.</p>
            <div className="btn-row centered">
              <button className="btn-primary" onClick={() => setStep('tech-info')}>Tentar Novamente</button>
              <button className="btn-secondary" onClick={resetApp}>Recomeçar</button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Linkado ao <strong>Fluxo Mobili</strong> <span className="footer-dot" aria-hidden="true" /></p>
      </footer>
    </div>
  );
}

export default App;
