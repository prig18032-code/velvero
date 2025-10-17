// server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase client created');
} else {
  console.log('Supabase not configured - uploads will NOT be saved to DB');
}

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

// Map a parsed CSV row to the sales table shape
function mapRowToSale(r) {
  // Accept many possible column names
  const date = r.date || r.transaction_date || r.order_date || null;
  const order_id = r.order_id || r.order || r.id || null;
  const sku = r.sku || r.item || r.product || r.product_name || 'UNKNOWN';
  const product_name = r.product_name || r.product || r.item || null;
  const quantity = r.quantity || r.qty || null;
  const unit_price = r.unit_price || r.price || null;
  const total_amount = r.total_amount || r.total || r.amount || null;
  const payment_type = r.payment_type || r.payment || null;
  const staff = r.staff || r.employee || null;

  return {
    date: date || null,
    order_id: order_id || null,
    sku: sku || null,
    product_name: product_name || null,
    quantity: quantity !== undefined && quantity !== '' ? parseInt(String(quantity).replace(/\D/g,'')) || 0 : null,
    unit_price: unit_price !== undefined && unit_price !== '' ? toNumber(unit_price) : null,
    total_amount: total_amount !== undefined && total_amount !== '' ? toNumber(total_amount) : null,
    payment_type: payment_type || null,
    staff: staff || null,
    created_at: new Date().toISOString()
  };
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const raw = fs.readFileSync(req.file.path, 'utf8');
    const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

    // compute KPIs (unchanged)
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
    const kpis = { revenue: Math.round(total * 100) / 100, orders, aov, top_skus: topSkus };
    const insights = generateInsights(kpis);

    // --- Insert rows into Supabase sales table (if configured) ---
    let supabaseResult = null;
    if (supabase) {
      try {
        const rowsToInsert = records.map(mapRowToSale);
        // Insert in batches to avoid huge single inserts for large files (here all at once for MVP)
        const { data, error } = await supabase.from('sales').insert(rowsToInsert).select();
        if (error) {
          console.error('Supabase insert error - FULL ERROR OBJECT:', error);
          if (error.details) console.error('Supabase error.details:', error.details);
          if (error.message) console.error('Supabase error.message:', error.message);
          supabaseResult = { success: false, error: error.message || JSON.stringify(error) };
        } else {
          supabaseResult = { success: true, inserted: data ? data.length : 0, data };
        }
      } catch (e) {
        console.error('Supabase insert exception:', e);
        supabaseResult = { success: false, error: String(e) };
      }
    } else {
      supabaseResult = { success: false, error: 'Supabase not configured' };
    }

    try { fs.unlinkSync(req.file.path) } catch(e) {}
    return res.json({ rows: records.length, sample: records.slice(0,5), kpis, insights, supabaseResult });
  } catch (err) {
    console.error('Upload error', err);
    return res.status(500).json({ error: 'server error', details: String(err?.message || err) });
  }
});

app.post('/api/save', async (req, res) => {
  // keep the existing /api/save for manual save if you still want it
  try {
    if (!supabase) return res.status(400).json({ error: 'Supabase not configured' });
    const { email, kpis, sample } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    const payload = { email, kpis, sample, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('reports').insert([payload]).select();
    if (error) {
      console.error('Supabase insert error', error);
      return res.status(500).json({ error: 'Supabase insert failed', details: error.message });
    }
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('Save error', err);
    return res.status(500).json({ error: 'save failed', details: String(err?.message || err) });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.resolve('public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Velvero SaaS (Supabase) running at http://localhost:${PORT}`);
});
