import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MASSIVE_API_KEY = Deno.env.get("MASSIVE_API_KEY");

function classify(verdict:string|null, move:number, implied:number|null){
  const abs=Math.abs(move); const imp=Number(implied||0);
  if(verdict==='BEAT' && move<0) return 'BEAT · NEGATIVE REACTION';
  if(verdict==='MISS' && move>0) return 'MISS · POSITIVE REACTION';
  if(imp>0 && abs>=imp) return `${verdict||'PRINT'} · MOVE EXCEEDS IMPLIED`;
  if(move>0) return `${verdict||'PRINT'} · POSITIVE REACTION${imp>0?' BELOW IMPLIED':''}`;
  if(move<0) return `${verdict||'PRINT'} · NEGATIVE REACTION${imp>0?' BELOW IMPLIED':''}`;
  return `${verdict||'PRINT'} · FLAT REACTION`;
}

function checkpointFor(eventTime:string){
  const mins=(Date.now()-new Date(eventTime).getTime())/60000;
  if(mins<10) return 'T+5M';
  if(mins<35) return 'T+15M';
  if(mins<120) return 'T+60M';
  return 'MANUAL';
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  if(!MASSIVE_API_KEY) return Response.json({error:'MASSIVE_API_KEY_NOT_CONFIGURED'},{status:503});
  const body=await req.json().catch(()=>({}));
  const market=Number(body.market??2);
  const ticker=String(body.ticker||'').toUpperCase();
  if(!ticker) return Response.json({error:'ticker required'},{status:400});
  const {data:event,error:eventError}=await db.from('earnings_events').select('*').eq('market',market).eq('ticker',ticker).single();
  if(eventError||!event) return Response.json({error:'event not found'},{status:404});
  const url=`https://api.massive.com/v3/snapshot?ticker=${encodeURIComponent(ticker)}&apiKey=${encodeURIComponent(MASSIVE_API_KEY)}`;
  const r=await fetch(url);
  if(!r.ok) return Response.json({error:'market data request failed',status:r.status,body:await r.text()},{status:502});
  const payload=await r.json();
  const snap=payload?.results?.[0];
  const session=snap?.session;
  const close=Number(session?.close);
  const price=Number(session?.price ?? snap?.last_trade?.price);
  if(!Number.isFinite(close)||!Number.isFinite(price)||close<=0) return Response.json({error:'snapshot missing close/price',snapshot:snap},{status:422});
  const realized=((price-close)/close)*100;
  const implied=event.implied_move_pct==null?null:Number(event.implied_move_pct);
  const checkpoint=String(body.checkpoint||checkpointFor(event.event_time));
  const classification=classify(event.verdict,realized,implied);
  const row={event_id:event.id,checkpoint,observed_at:new Date().toISOString(),close_price:close,observed_price:price,realized_move_pct:Number(realized.toFixed(4)),implied_move_pct:implied,classification,source_url:`https://api.massive.com/v3/snapshot?ticker=${ticker}`,source_verified:true};
  const {data,error}=await db.from('reaction_snapshots').upsert(row,{onConflict:'event_id,checkpoint'}).select().single();
  if(error) return Response.json({error:error.message},{status:500});
  return Response.json({ok:true,ticker,market,market_status:snap?.market_status||null,checkpoint,reaction:data});
});