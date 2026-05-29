# 🐉 Agentes-Z

Ecosistema de agentes de IA para vender **PAGASI**, con dashboard estilo Dragon Ball.

- **Krillin** — Prospectador: busca financieras / casas comerciales reales que dan crédito a cuotas.
- **Vegeta** — Outreach: redacta el mensaje personalizado (gancho: 100+ créditos, 0% mora).
- **Goku** — Revisor (modelo más capaz): aprueba o corrige antes de mostrártelo.
- **Tú** — apruebas o descartas cada lead desde la cola.

## Cómo correrlo

```bash
cd "agentes-z"
npm install
npm start
```

Abre <http://localhost:3000>.

### Sin API key → Modo simulación
Funciona de inmediato con datos de ejemplo, para que veas el dashboard y a los personajes trabajar.

### Con API key → Modo real
```bash
cp .env.example .env
# pega tu ANTHROPIC_API_KEY en .env
npm start
```
Krillin usará búsqueda web para encontrar prospectos reales y Goku revisará con Opus.

## Notas
- El arte de los personajes es CSS original (estilo DBZ). Es solo para tu panel interno; no va dentro de PAGASI ni en material público.
- Esto es el slice 1: Krillin + Vegeta + Goku. Después vienen Piccolo (investigador), Gohan (contenido) y Trunks (SEO), y el envío real por LinkedIn/email.
