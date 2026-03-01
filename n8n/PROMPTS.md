# Estratgia de Prompts - Nano Banana

Para garantir que o **Fluxo Render** mantenha a consistncia visual entre diferentes ngulos do mesmo ambiente, utilizaremos a seguinte estrutura de prompt:

## 1. Contexto Mestre (Batch Level)
Cada lote de imagens (ex: "Cozinha") compartilhar um radical de estilo:
> "Estilo: [PromptMaster]. Paleta de cores baseada em MDF [MDFColor]. Iluminao global coerente, fotorrealismo 8k, texturas luxuosas."

## 2. Controle Estrutural (Image Level)
Usaremos a imagem do Promob como guia de profundidade (Depth Map) e estrutura:
> "Mantenha rigorosamente a posio dos armrios, bancadas e janelas da imagem de referncia. Transforme os schanter/blocos 3D em materiais reais."

## 3. Injeo de Dados Tcnicos
Injetaremos as ferragens no "copy" da apresentao via IA:
> "Gere um texto comercial destacando o uso de [HingeType] e espessura de [Thickness] para durabilidade extrema."

## Fluxo no n8n
1. **Node 1**: Extrai metadados do lote.
2. **Node 2 (Gemini)**: Gera o Prompt Master.
3. **Node 3 (Nano Banana)**: Itera sobre cada imagem usando o Prompt Master + Imagem de Referncia.
4. **Node 4 (Canva)**: Alimenta o template com a URL das imagens e os textos técnicos.
