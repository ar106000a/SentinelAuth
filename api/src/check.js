import fs from "fs";
// setTimeout(() => console.log("Timeout1 "), 0);
// fs.readFile("__filename", () => {
//   console.log("IO 1");
//   Promise.resolve().then(() => console.log("second promise from IO."));
//   setTimeout(() => console.log("Timer 2 from IO"), 0);
//   fs.readFile("__filename", () => console.log("second IO"));
// });
// Promise.resolve().then(() => console.log("Promise 1"));
fs.readFile("./index.js",()=> console.log("IO"));
setTimeout(()=>console.log("Timeout"),4)