import { useState } from 'react';
import { Upload, Camera, Database, ChevronRight, CheckCircle, Boxes, Sparkles } from 'lucide-react';
import './App.css';

type Step = 'upload' | 'tech-info' | 'generating' | 'finished';

interface EnvironmentData {
  name: string;
  images: File[];
  mdfColor: string;
  hingeType: string;
  slideType: string;
  thickness: string;
}

function App() {
  const [step, setStep] = useState<Step>('upload');
  const [envData, setEnvData] = useState<EnvironmentData>({
    name: 'Cozinha Principal',
    images: [],
    mdfColor: '',
    hingeType: 'Standard',
    slideType: 'Telescópica',
    thickness: '15mm',
  });

  const handleNext = async () => {
    if (step === 'upload') setStep('tech-info');
    else if (step === 'tech-info') {
      setStep('generating');
      // Logic to trigger n8n
      try {
        const formData = {
          environment: envData.name,
          mdf: envData.mdfColor,
          specs: `Ferragens: ${envData.hingeType}, Corredias: ${envData.slideType}, Espessura: ${envData.thickness}`,
          // In a real scenario, we would upload images to S3/Cloudinary first
          images: envData.images.map((f: File) => f.name)
        };

        console.log("Enviando para o n8n:", formData);
        // await fetch(import.meta.env.VITE_N8N_WEBHOOK, { method: 'POST', body: JSON.stringify(formData) });

        // Simulating processing time
        setTimeout(() => setStep('finished'), 5000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const [promptMaster, setPromptMaster] = useState("Moderno, iluminao natural, texturas realistas");

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <Boxes size={32} className="text-primary" />
          <h1 className="gradient-text">Fluxo Render</h1>
        </div>
        <nav className="status-nav">
          <div className={`nav-item ${step === 'upload' ? 'active' : ''}`}>1. Ambientes</div>
          <div className={`nav-item ${step === 'tech-info' ? 'active' : ''}`}>2. Dados Tcnicos</div>
          <div className={`nav-item ${step === 'generating' || step === 'finished' ? 'active' : ''}`}>3. Renderizao</div>
        </nav>
      </header>

      <main className="main">
        {step === 'upload' && (
          <section className="glass-card wizard-step fade-in">
            <div className="step-content">
              <Sparkles size={48} className="icon-accent" />
              <h2>Vamos comear por onde?</h2>
              <p className="text-muted">Defina o nome do lote (ex: Cozinha) e suba suas capturas do Promob.</p>

              <div className="form-group">
                <label>Nome do Ambiente</label>
                <input
                  type="text"
                  className="input-field"
                  value={envData.name}
                  onChange={(e) => setEnvData({ ...envData, name: e.target.value })}
                />
              </div>

              <div className="upload-zone">
                <Camera size={40} className="text-muted" />
                <p>Arraste aqui as imagens do Promob</p>
                <input
                  type="file"
                  multiple
                  className="file-input"
                  onChange={(e) => e.target.files && setEnvData({ ...envData, images: Array.from(e.target.files) })}
                />
              </div>

              <button className="btn-primary" onClick={handleNext}>
                Prximo Passo <ChevronRight size={20} />
              </button>
            </div>
          </section>
        )}

        {step === 'tech-info' && (
          <section className="glass-card wizard-step fade-in">
            <div className="step-content">
              <Database size={48} className="icon-accent" />
              <h2>Detalhes que encantam</h2>
              <p className="text-muted">Essas informaes sero inseridas automaticamente na sua apresentao.</p>

              <div className="grid-form">
                <div className="form-group col-span-2">
                  <label>Estilo Visual (Prompt Master)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={promptMaster}
                    onChange={(e) => setPromptMaster(e.target.value)}
                    placeholder="Ex: Minimalista, Escandinavo, Luxo..."
                  />
                </div>
                <div className="form-group">
                  <label>Cor do MDF</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: Louro Freij"
                    value={envData.mdfColor}
                    onChange={(e) => setEnvData({ ...envData, mdfColor: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Tipo de Dobradia</label>
                  <select className="input-field" value={envData.hingeType} onChange={(e) => setEnvData({ ...envData, hingeType: e.target.value })}>
                    <option>Standard</option>
                    <option>Com Amortecimento</option>
                    <option>Invisvel</option>
                  </select>
                </div>
              </div>

              <button className="btn-primary" onClick={handleNext}>
                Gerar Render & Apresentao <Sparkles size={20} />
              </button>
            </div>
          </section>
        )}

        {step === 'generating' && (
          <div className="generating-overlay fade-in">
            <div className="spinner"></div>
            <h3>O Nano Banana Pro est processando...</h3>
            <p className="text-muted">Garantindo consistncia visual em {envData.images.length} imagens.</p>
          </div>
        )}

        {step === 'finished' && (
          <section className="glass-card wizard-step fade-in">
            <div className="step-content">
              <CheckCircle size={64} className="icon-success" />
              <h2>Sucesso! Sua apresentao está pronta.</h2>
              <p className="text-muted">O link do Canva foi gerado e enviado para o seu WhatsApp/E-mail.</p>

              <div className="actions">
                <button className="btn-primary">Ver no Canva</button>
                <button className="btn-secondary" onClick={() => setStep('upload')}>Novo Ambiente</button>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p> linkado ao <strong>Fluxo Mobili</strong></p>
      </footer>
    </div>
  );
}

export default App;
