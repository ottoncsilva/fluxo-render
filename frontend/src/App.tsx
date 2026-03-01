import { useState, useRef } from 'react';
import { Camera, Database, ChevronRight, CheckCircle, Boxes, Sparkles, AlertCircle, ExternalLink, Plus, X, Image } from 'lucide-react';
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

const N8N_WEBHOOK = import.meta.env.VITE_N8N_WEBHOOK as string;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the "data:image/jpeg;base64," prefix — n8n receives just the raw base64
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
  });
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
  const [promptMaster, setPromptMaster] = useState('Moderno, iluminação natural, texturas realistas');
  const [canvaLink, setCanvaLink] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const newImages = Array.from(files);
    setEnvData((prev) => ({ ...prev, images: [...prev.images, ...newImages] }));
  };

  const removeImage = (index: number) => {
    setEnvData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleNext = async () => {
    if (step === 'upload') {
      if (!envData.name.trim()) {
        alert('Por favor, defina o nome do ambiente.');
        return;
      }
      setStep('tech-info');
      return;
    }

    if (step === 'tech-info') {
      setStep('generating');
      setErrorMessage('');

      try {
        // Convert all images to base64 in the browser
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

        const response = await fetch(N8N_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        setCanvaLink(result.canva_link || result.link || '');
        setStep('finished');
      } catch (err) {
        console.error('Erro ao processar:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido. Tente novamente.');
        setStep('error');
      }
    }
  };

  const resetApp = () => {
    setEnvData({ name: '', images: [], mdfColor: '', hingeType: 'Standard', slideType: 'Telescópica', thickness: '15mm' });
    setPromptMaster('Moderno, iluminação natural, texturas realistas');
    setCanvaLink('');
    setErrorMessage('');
    setStep('upload');
  };

  const stepNumber = step === 'upload' ? 1 : step === 'tech-info' ? 2 : 3;

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <Boxes size={28} className="logo-icon" />
          <h1 className="gradient-text">Fluxo Render</h1>
        </div>
        <nav className="status-nav">
          {['Ambientes', 'Dados Técnicos', 'Renderização'].map((label, i) => (
            <div key={label} className={`nav-item ${stepNumber === i + 1 ? 'active' : stepNumber > i + 1 ? 'done' : ''}`}>
              <span className="nav-dot">{stepNumber > i + 1 ? '✓' : i + 1}</span>
              {label}
            </div>
          ))}
        </nav>
      </header>

      <main className="main">
        {/* ── STEP 1: Upload ── */}
        {step === 'upload' && (
          <section className="glass-card wizard-step fade-in">
            <div className="step-icon-wrap"><Sparkles size={40} className="icon-accent" /></div>
            <h2>Vamos começar</h2>
            <p className="text-muted">Defina o nome do ambiente e suba as capturas do Promob.</p>

            <div className="form-group">
              <label>Nome do Ambiente</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Cozinha Principal, Suite Master..."
                value={envData.name}
                onChange={(e) => setEnvData({ ...envData, name: e.target.value })}
              />
            </div>

            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addImages(e.dataTransfer.files); }}
            >
              <Camera size={36} className="text-muted" />
              <p>Arraste ou clique para adicionar imagens do Promob</p>
              <span className="upload-hint">JPG, PNG — até 5MB por imagem</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="file-input"
                onChange={(e) => addImages(e.target.files)}
              />
            </div>

            {envData.images.length > 0 && (
              <div className="image-preview-grid">
                {envData.images.map((file, i) => (
                  <div key={i} className="image-preview-item">
                    <Image size={14} />
                    <span>{file.name}</span>
                    <button className="remove-btn" onClick={() => removeImage(i)}><X size={12} /></button>
                  </div>
                ))}
                <button className="add-more-btn" onClick={() => fileInputRef.current?.click()}>
                  <Plus size={14} /> Adicionar mais
                </button>
              </div>
            )}

            <button className="btn-primary" onClick={handleNext}>
              Próximo Passo <ChevronRight size={18} />
            </button>
          </section>
        )}

        {/* ── STEP 2: Tech Info ── */}
        {step === 'tech-info' && (
          <section className="glass-card wizard-step fade-in">
            <div className="step-icon-wrap"><Database size={40} className="icon-accent" /></div>
            <h2>Detalhes Técnicos</h2>
            <p className="text-muted">Essas informações geram o render e preenchem a apresentação automaticamente.</p>

            <div className="grid-form">
              <div className="form-group col-span-2">
                <label>Estilo Visual (Prompt Master)</label>
                <input
                  type="text"
                  className="input-field"
                  value={promptMaster}
                  onChange={(e) => setPromptMaster(e.target.value)}
                  placeholder="Ex: Minimalista, Escandinavo, Luxo contemporâneo..."
                />
              </div>
              <div className="form-group">
                <label>Cor do MDF</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Louro Freijó, Off-White..."
                  value={envData.mdfColor}
                  onChange={(e) => setEnvData({ ...envData, mdfColor: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Espessura do MDF</label>
                <select className="input-field" value={envData.thickness} onChange={(e) => setEnvData({ ...envData, thickness: e.target.value })}>
                  <option>15mm</option>
                  <option>18mm</option>
                  <option>25mm</option>
                </select>
              </div>
              <div className="form-group">
                <label>Tipo de Dobradiça</label>
                <select className="input-field" value={envData.hingeType} onChange={(e) => setEnvData({ ...envData, hingeType: e.target.value })}>
                  <option>Standard</option>
                  <option>Com Amortecimento</option>
                  <option>Invisível</option>
                </select>
              </div>
              <div className="form-group">
                <label>Tipo de Corrediça</label>
                <select className="input-field" value={envData.slideType} onChange={(e) => setEnvData({ ...envData, slideType: e.target.value })}>
                  <option>Telescópica</option>
                  <option>Oculta (Undermount)</option>
                  <option>Push-to-open</option>
                </select>
              </div>
            </div>

            <div className="btn-row">
              <button className="btn-secondary" onClick={() => setStep('upload')}>← Voltar</button>
              <button className="btn-primary" onClick={handleNext}>
                Gerar Render & Apresentação <Sparkles size={18} />
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 3: Generating ── */}
        {step === 'generating' && (
          <div className="generating-overlay fade-in">
            <div className="spinner-ring" />
            <h3>Processando com IA...</h3>
            <p className="text-muted">
              Gerando renders de <strong>{envData.images.length}</strong> imagem{envData.images.length !== 1 ? 's' : ''} do ambiente <strong>"{envData.name}"</strong>
            </p>
            <p className="text-muted-sm">Isso pode levar alguns minutos. Aguarde.</p>
          </div>
        )}

        {/* ── STEP 4: Finished ── */}
        {step === 'finished' && (
          <section className="glass-card wizard-step fade-in">
            <div className="step-icon-wrap"><CheckCircle size={56} className="icon-success" /></div>
            <h2>Apresentação pronta! 🎉</h2>
            <p className="text-muted">Seus renders foram gerados e a apresentação foi criada no Canva.</p>

            <div className="btn-row centered">
              {canvaLink ? (
                <a href={canvaLink} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  Ver no Canva <ExternalLink size={16} />
                </a>
              ) : (
                <p className="text-muted-sm">Link do Canva não retornado. Verifique o painel do n8n.</p>
              )}
              <button className="btn-secondary" onClick={resetApp}>Novo Ambiente</button>
            </div>
          </section>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <section className="glass-card wizard-step fade-in error-card">
            <div className="step-icon-wrap"><AlertCircle size={56} className="icon-error" /></div>
            <h2>Algo deu errado</h2>
            <p className="text-muted">{errorMessage}</p>
            <p className="text-muted-sm">Verifique se o n8n está ativo em <strong>n8n.digicasa.com.br</strong> e tente novamente.</p>
            <div className="btn-row centered">
              <button className="btn-primary" onClick={() => setStep('tech-info')}>Tentar Novamente</button>
              <button className="btn-secondary" onClick={resetApp}>Recomeçar</button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Linkado ao <strong>Fluxo Mobili</strong> · <span className="footer-dot" /> n8n.digicasa.com.br</p>
      </footer>
    </div>
  );
}

export default App;
