# N-HUB Pipeline — Deploy na VPS

## Estrutura

```
nhub_pipeline/
  main.py              ← FastAPI (3 rotas webhook)
  config.py            ← Credenciais (lê do .env)
  prompts.py           ← System prompts dos 3 fluxos
  utils.py             ← Helpers compartilhados (Supabase, Apify, Claude)
  flows/
    estaticos.py       ← Fluxo: imagens simples
    carrossel.py       ← Fluxo: carrossel (Vision API)
    videos.py          ← Fluxo: vídeos (Whisper + Claude)
  requirements.txt
  .env.example
```

## Fluxos

| Rota             | Tipo       | IA usada                          |
|------------------|------------|-----------------------------------|
| /webhook/estaticos | Imagens   | Claude Sonnet 4.5                 |
| /webhook/carrossel | Carrossel | OpenRouter Vision → Claude Sonnet |
| /webhook/videos    | Vídeos    | Groq Whisper → Claude Sonnet 4.6  |

## Setup na VPS

```bash
# 1. Clonar / enviar arquivos para a VPS
cd /home/ubuntu  # ou onde preferir
git clone ... nhub_pipeline   # ou scp/rsync

cd nhub_pipeline

# 2. Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# 3. Instalar dependências
pip install -r requirements.txt

# 4. Configurar variáveis de ambiente
cp .env.example .env
nano .env   # preencher ANTHROPIC_API_KEY (mínimo)

# 5. Testar localmente
python main.py
# → http://localhost:8000/health

# 6. Rodar com PM2 (recomendado para produção)
pm2 start "venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name nhub-pipeline \
  --cwd /home/ubuntu/nhub_pipeline

pm2 save
pm2 startup
```

## Configurar Cloudflare Tunnel (opcional)

Se quiser expor via tunnel igual ao n8n:

```bash
cloudflared tunnel route dns <TUNNEL_ID> pipeline.seudominio.com
```

E no config do tunnel:
```yaml
ingress:
  - hostname: pipeline.seudominio.com
    service: http://localhost:8000
```

## Configurar webhooks no Apify

No Apify, no actor de cada tipo, configure o webhook:
- **Estáticos:** `https://pipeline.seudominio.com/webhook/estaticos`
- **Carrossel:** `https://pipeline.seudominio.com/webhook/carrossel`
- **Vídeos:** `https://pipeline.seudominio.com/webhook/videos`

O Apify envia automaticamente o `resource.defaultDatasetId` no body — os fluxos já estão preparados para isso.

## Logs

```bash
pm2 logs nhub-pipeline
# ou
tail -f nhub_pipeline.log
```
