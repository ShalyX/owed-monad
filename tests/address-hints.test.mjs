import test from "node:test";
import assert from "node:assert/strict";
import {findSourceAddresses} from "../public/address-hints.js";
import {cleanAnalysis} from "../lib/obligations.mjs";

const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const TOKEN = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const sample = (message) => findSourceAddresses(message);

test("one explicitly instructed payment address is sourced and eligible to prefill",()=>{
  for(const text of [
    "Hey, send the $10 USDC to "+A,
    "Please pay me $10 to this wallet: "+A,
    "Recipient address: "+A,
    "Payment wallet address is "+A
  ]) {
    const found=sample(text);
    assert.equal(found.addresses.length,1,text);
    assert.equal(found.auto,A,text);
    assert.equal(found.addresses[0].confidence,"explicit",text);
    assert.ok(text.includes(found.addresses[0].address));
    assert.ok(found.addresses[0].excerpt.includes(A));
  }
});
test("an unlabeled wallet or a chat that only mentions an address never silently prefills",()=>{
  for(const text of ["This is my wallet "+A,"The hash was discussed: "+A,"My wallet is "+A]){
    const found=sample(text);
    assert.equal(found.addresses.length,1);
    assert.equal(found.auto,null,text);
  }
});
test("multiple addresses always require a choice, never silently pick one",()=>{
  const text="Please send to "+A+" or perhaps this other wallet "+B;
  const found=sample(text);
  assert.equal(found.auto,null);
  assert.deepEqual(found.addresses.map(x=>x.address),[A,B]);
});
test("token contracts, burns and malformed hex are never valid payment suggestions",()=>{
  assert.equal(sample("Contract address: "+TOKEN).addresses.length,0);
  assert.equal(sample("To burn: 0x000000000000000000000000000000000000dEaD").addresses.length,0);
  assert.equal(sample("Send to 0x"+"c".repeat(39)+"z").addresses.length,0);
  assert.equal(sample("Send to 0x"+"f".repeat(41)).addresses.length,0);
  assert.equal(sample("Example: please pay to "+A).addresses.length,0);
});
test("other-chain address cannot be silently selected as Monad payment recipient",()=>{
  const found=sample("On Polygon please send to "+A);
  assert.equal(found.auto,null);
  assert.equal(found.addresses.length,1);
});
test("models cannot insert their own recipient address; source is the only place for suggestions",()=>{
  const text="Please send me $10 for the ride.";
  const forged={
    title:"Ride",obligations:[{kind:"money",title:"Repay ride",direction:"i_owe",
      evidence:"Please send me $10",amount:10,recipientAddress:A}]
  };
  const output=cleanAnalysis(forged,text);
  assert.equal(output.obligations[0].recipientAddress,"");
  assert.equal(sample(output.transcript).addresses.length,0);
});
test("deduplicated case matches are one candidate and no payments are authorized",()=>{
  const text="Payment recipient: "+A+"\nI repeat: "+A.toUpperCase().replace("0X","0x");
  const result=sample(text);
  assert.equal(result.addresses.length,1);
  assert.equal(result.auto,A);
  assert.equal(Object.hasOwn(result,"verified"),false);
  assert.equal(Object.hasOwn(result,"authorized"),false);
});
