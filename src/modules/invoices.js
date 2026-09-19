export function invoiceSubtotal(inv){return (inv?.items||[]).reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.price)||0),0)}
export function invoiceTotal(inv){const sub=invoiceSubtotal(inv),discount=Math.min(sub,Math.max(0,Number(inv?.discount)||0)),dp=Math.min(100,Math.max(0,Number(inv?.discountPercent)||0)),after=Math.max(0,sub-discount),pct=after*dp/100,taxRate=Math.min(100,Math.max(0,Number(inv?.taxRate)||0));return Math.max(0,Math.round(after-pct+(after-pct)*taxRate/100))}
export function invoiceRemaining(inv){return Math.max(0,invoiceTotal(inv)-Math.max(0,Number(inv?.paid)||0))}
