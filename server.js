// server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'tmp_uploads/' });

function generateInsights(kpis) {
  const insights = [];
  if (kpis.revenue && kpis.revenue > 0) {
    insights.push(`Revenue: £${kpis.revenue}. Consider a short promotion for the top product.`);
  } else {
    insights.push('No revenue detected — check your CSV columns.');
  }
  if (kpis.top_skus && kpis.top_skus.length > 0) {
    insights.push(`Top SKU: ${kpis.top_skus[0].sku} (qty ${kpis.top_skus[0].qty}) — bundle or promote it.`);
  }
  insights.push('Track repeat customers and consider loyalty offers.');
  return insights.join('\n');
}

function toNumber(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v).replace(/[£,]/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const raw = fs.readFileSync(req.file.path, 'utf8');
    const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
    let total = 0;
    let orders = records.length;
    const skuCounts = {};
    for (const r of records) {
      const totalCandidates = ['total_amount','total','amount','price','unit_price'];
      let rowTotal = 0;
      for (const c of totalCandidates) {
        if (r[c] !== undefined) { rowTotal = toNumber(r[c]); break; }
      }
      if (rowTotal === 0 && (r['quantity'] || r['qty']) && (r['unit_price'] || r['price'])) {
        const q = toNumber(r['quantity'] || r['qty']);
        const p = toNumber(r['unit_price'] || r['price']);
        rowTotal = q * p;
      }
      total += rowTotal;
      const sku = r['sku'] || r['item'] || r['product'] || r['product_name'] || 'UNKNOWN';
      skuCounts[sku] = (skuCounts[sku] || 0) + (toNumber(r['quantity'] || r['qty']) || 1);
    }
    const aov = orders > 0 ? Math.round((total / orders) * 100) / 100 : 0;
    const topSkus = Object.keys(skuCounts).map(k => ({ sku: k, qty: skuCounts[k] })).sort((a,b)=>b.qty-a.qty).slice(0,5);
    try { fs.unlinkSync(req.file.path) } catch(e) {}
    const kpis = { revenue: Math.round(total * 100) / 100, orders, aov, top_skus: topSkus };
    const insights = generateInsights(kpis);
    return res.json({ rows: records.length, sample: records.slice(0,5), kpis, insights });
  } catch (err) {
    console.error('Upload error', err);
    return res.status(500).json({ error: 'server error', details: String(err?.message || err) });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.resolve('public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Velvero SaaS MVP running at http://localhost:${PORT}`);
});
