import test from "node:test";
import assert from "node:assert/strict";
import { missingObligations } from "../public/obligation-merge.js";
const item = (kind,evidence,amount,status="open")=>({kind,evidence,amount,status,id:Math.random().toString()});
test("reanalyzing the exact Bolt chat adds only the newly discovered $8 debt",()=>{
 const oldTask=item("task","Don't forget to send me that apartment link we were checking out. I already sorted the booking for Saturday.",null,"done");
 const stored={fingerprint:"x",obligations:[oldTask]};
 const fresh={fingerprint:"x",obligations:[
  item("money","Your part was $8. Just send it whenever you can.",8),
  item("task","send me that apartment link",null)
 ]};
 const additions=missingObligations(stored,fresh);
 assert.equal(additions.length,1);
 assert.equal(additions[0].kind,"money");
 assert.equal(oldTask.status,"done");
 assert.equal(stored.obligations.length,1);
});
test("rechecks do not duplicate settled payment receipts or independent tasks",()=>{
 const paid=item("money","Your part was $8. Just send it.",8,"settled");
 paid.txHash="0x"+"a".repeat(64);
 const old={obligations:[paid,item("task","send me the apartment link",null,"done")]};
 const latest={obligations:[item("money","Your part was $8. Just send it.",8),item("task","Don't forget to send me the apartment link",null)]};
 assert.equal(missingObligations(old,latest).length,0);
 assert.equal(paid.txHash.length,66);
});
test("two distinct expenses of equal amount remain distinct",()=>{
 const old={obligations:[item("money","You owe me $8 for coffee.",8)]};
 const fresh={obligations:[item("money","You owe me $8 for coffee.",8),item("money","You owe me $8 for Bolt.",8)]};
 assert.equal(missingObligations(old,fresh).length,1);
});
