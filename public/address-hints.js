// Exact-address suggestions from the user's own source text.
// Never synthesize, infer, or pick an address from LLM output.
// An EVM-formatted address is NOT proof of chain or recipient ownership.
const ADDRESS = /(?<![0-9a-zA-Z])0x[a-fA-F0-9]{40}(?![0-9a-zA-Z])/g;
const excluded = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0x534b2f3a21130d7a60830c2df862319e593943a3" // Circle USDC contract
]);
function excerpt(text, start, end) {
  const left = Math.max(0, start - 66), right = Math.min(text.length, end + 22);
  return (left ? "…" : "") + text.slice(left, right).replace(/\s+/g, " ").trim() + (right < text.length ? "…" : "");
}
function classify(text, index, address, context) {
  const prior = text.slice(Math.max(0, index - 130), index);
  const nearby = prior.split(/[\n.!?;]/).pop().trim();
  const after = text.slice(index + address.length, index + address.length + 60);
  if (/\b(?:example|sample|hypothetical|pretend|demo)\b/i.test(nearby)) {
    return {type:"excluded",label:"Example, not a recipient"};
  }
  if (/\b(?:ethereum mainnet|not monad|polygon|arbitrum|base mainnet|base network)\b/i.test(nearby + " " + after)) {
    return {type:"possible",label:"Check the network independently"};
  }
  if (/\b(?:contract|token|factory|spender|burn|router|deployer|explorer|example|sample|dummy)\s*(?:(?:wallet|account|address)\s*)?(?:is|at|:|=)?\s*$/i.test(nearby) ||
      /\b(?:don't|do not|never|not)\s+(?:send|pay|transfer)\b/i.test(nearby)) {
    return {type:"excluded",label:"Not a recipient"};
  }
  if (/\b(?:send|pay|transfer)\b.{0,80}\b(?:to|into|at)\s*(?:(?:this|my|the|our|recipient|monad|wallet|payment)\s+){0,4}(?:address|wallet|account|0x)?\s*:?\s*$/i.test(nearby) ||
      /\b(?:recipient|destination|payee)(?:\s+wallet)?(?:\s+address)?\s*(?:is|:|=)?\s*$/i.test(nearby) ||
      /\b(?:payment|pay)\s+(?:wallet\s+)?address\s*(?:is|:|=)?\s*$/i.test(nearby)) {
    return {type:"explicit",label:"Payment destination in message"};
  }
  if (/\b(?:my|our|their)\s+(?:(?:monad|usdc)\s+)?(?:wallet|address)\s*(?:is|:|=|at)?\s*$/i.test(nearby) ||
      /\b(?:wallet|address)\s*(?:is|:|=)\s*$/i.test(nearby)) {
    return {type:"possible",label:"Address mentioned in message"};
  }
  if (/\b(?:ethereum mainnet|other chain|not monad|polygon|arbitrum|base network)\b/i.test(nearby + " " + after)) {
    return {type:"possible",label:"Check the network independently"};
  }
  return {type:"possible",label:"Address found in message"};
}
export function findSourceAddresses(sourceText, {limit=5}={}) {
  const text = String(sourceText || "").slice(0,20000);
  const seen = new Set();
  const all = [];
  for (const found of text.matchAll(ADDRESS)) {
    const address = found[0], key=address.toLowerCase(), index=found.index;
    if (seen.has(key) || excluded.has(key)) continue;
    const label = classify(text,index,address);
    if (label.type==="excluded") continue;
    seen.add(key);
    all.push({address,label:label.label,confidence:label.type,excerpt:excerpt(text,index,index+address.length)});
  }
  // Multiple destinations can belong to different people or contexts.
  // Only one source-grounded, clearly annotated destination may be prefilled.
  const auto = all.length===1 && all[0].confidence==="explicit" ? all[0].address : null;
  return {addresses:all.slice(0,Math.max(0,limit)),auto,additional:Math.max(0,all.length-limit)};
}
