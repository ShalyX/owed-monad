import test from "node:test";
import assert from "node:assert/strict";
import { sourceStatements } from "../public/source-statements.js";
import { explicitSpokenPayments } from "../lib/spoken-obligations.mjs";
import { cleanAnalysis } from "../lib/obligations.mjs";
import { inspectFinancialContext } from "../public/financial-context.js";

const empty = () => ({ title: "Coffee", obligations: [] });
const analyze = (source, perspective = "incoming") => cleanAnalysis(empty(), source, "text", perspective);

test("decimal USDC is one sentence, not punctuation-separated", () => {
  const source = "You still owe me 0.01 USDC for coffee. Please send the venue address.";
  const segments = sourceStatements(source);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, "You still owe me 0.01 USDC for coffee.");
  assert.equal(source.slice(segments[1].start, segments[1].end), segments[1].text);
});

test("exact public-site failing phrase is recovered as 0.01 USDC even when AI returns nothing", () => {
  for (const source of [
    "You still owe me 0.01 USDC for coffee",
    "You still owe me 0.01 USDC for coffee.",
    "You still owe me $0.01 for coffee.",
    "Hey, you still owe me 0.01 USDC for coffee!"
  ]) {
    const result = analyze(source);
    const money = result.obligations.filter(x => x.kind === "money");
    assert.equal(money.length, 1, JSON.stringify({source,items:result.obligations}));
    assert.equal(money[0].amount, 0.01);
    assert.equal(money[0].direction, "i_owe");
    assert.equal(money[0].recipientAddress, "");
    assert.equal(money[0].txHash, "");
    assert.ok(source.includes(money[0].evidence));
  }
});

test("a decimal money obligation and separate venue task are both preserved", () => {
  const result = analyze("You still owe me 0.01 USDC for coffee. Please send the venue address.");
  assert.equal(result.obligations.filter(x=>x.kind==="money").length,1);
  assert.equal(result.obligations.filter(x=>x.kind==="task").length,1);
});

test("decimal currency reversal and recorded perspective do not become a payable debt", () => {
  const incoming = analyze("I owe you 0.01 USDC for coffee.");
  assert.equal(incoming.obligations[0].direction, "owed_to_me");
  const recorded = analyze("You still owe me 0.01 USDC for coffee.", "recording");
  assert.equal(recorded.obligations[0].direction, "owed_to_me");
});

test("decimal conditional and hypothetical statements never create a payable item", () => {
  for(const source of [
    "If you still owe me 0.01 USDC for coffee, let me know.",
    "Imagine you owe me 0.01 USDC for coffee.",
    "You still owe me 0.01 USDC only if I pay first."
  ]) {
    const res = analyze(source);
    assert.equal(res.obligations.filter(x=>x.kind==="money" && x.direction==="i_owe").length,0,source);
  }
});

test("decimal USDC correction supersedes original debt", () => {
  const source = "You still owe me 0.01 USDC. Make it 0.02 USDC instead.";
  const context = inspectFinancialContext(source);
  assert.equal(context.correction?.latest,0.02);
  const result = analyze(source);
  assert.equal(result.obligations.filter(x=>x.kind==="money"&&x.amount===0.01).length,0);
  assert.equal(result.obligations.filter(x=>x.kind==="money"&&x.amount===0.02).length,1);
});

test("decimal scan never rounds amounts or multiplies units", () => {
  assert.equal(explicitSpokenPayments("You owe me 0.000001 USDC.")[0].amount,0.000001);
  assert.equal(analyze("You owe me 0.0000001 USDC.").obligations.filter(x=>x.kind==="money").length,0);
  assert.equal(analyze("You owe me 0 USDC.").obligations.filter(x=>x.kind==="money").length,0);
});
