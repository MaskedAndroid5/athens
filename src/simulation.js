export const kinds = {home:{label:'Residence',demand:4,supply:0},workshop:{label:'Workshop',demand:8,supply:0},solar:{label:'Energy pavilion',demand:0,supply:12}};
export function simulate(objects, factor=1, policy='equal') {
 const supply=objects.reduce((n,o)=>n+kinds[o.kind].supply,0)*factor;
 const consumers=objects.filter(o=>kinds[o.kind].demand>0 && o.connected);
 const demand=consumers.reduce((n,o)=>n+kinds[o.kind].demand,0);
 let remaining=supply;
 const allocation=Object.fromEntries(consumers.map(o=>{const need=kinds[o.kind].demand;const delivered=policy==='priority'?Math.min(remaining,need):need*Math.min(1,demand?supply/demand:1);remaining-=delivered;return [o.id,delivered]}));
 return {supply,demand,used:Math.min(supply,demand),surplus:Math.max(0,supply-demand),objects:objects.map(o=>({...o,need:kinds[o.kind].demand,delivered:allocation[o.id]??0,status:kinds[o.kind].supply?'producing':!o.connected?'disconnected':(allocation[o.id]??0)>=kinds[o.kind].demand?'operational':'constrained'}))};
}
