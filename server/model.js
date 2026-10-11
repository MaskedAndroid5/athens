import {kinds} from '../src/simulation.js';
export function validateObjects(objects){
 if(!Array.isArray(objects)||objects.length>80)throw new Error('A parcel supports up to 80 objects.');
 const ids=new Set();
 for(const o of objects){if(!o||typeof o.id!=='string'||o.id.length>80||ids.has(o.id)||!Object.hasOwn(kinds,o.kind)||!Array.isArray(o.position)||o.position.length!==2||!o.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=18)||!Number.isFinite(o.rotation)||!Number.isFinite(o.scale)||o.scale<0.5||o.scale>2||typeof o.connected!=='boolean')throw new Error('Invalid construction object.');ids.add(o.id)}
 return objects.map(({id,kind,position,rotation,scale,connected})=>({id,kind,position,rotation,scale,connected}));
}
export function canModify(parcel,user){return !!user&&parcel.owner===user.id}
