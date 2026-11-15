// import fs from "fs";
// // setTimeout(() => console.log("Timeout1 "), 0);
// // fs.readFile("__filename", () => {
// //   console.log("IO 1");
// //   Promise.resolve().then(() => console.log("second promise from IO."));
// //   setTimeout(() => console.log("Timer 2 from IO"), 0);
// //   fs.readFile("__filename", () => console.log("second IO"));
// // });
// // Promise.resolve().then(() => console.log("Promise 1"));
// fs.readFile("./index.js",()=> console.log("IO"));
// setTimeout(()=>console.log("Timeout"),4)
// const iterator=numbers[Symbol.iterator]();
// console.log(iterator.next());
// const numbers=[1,2,3];
// for(const number of numbers){
//     console.log(number);
// }

const myCollection={
    values:[1,2,3,4,5,6,7],
    [Symbol.iterator](){
        let index=0;
        return{
        next:()=>{
            if(index<this.values.length){
                return {
                    value: this.values[index++],
                    done:false
                }
            }
            return{
                value:undefined,
                done:true,
            }
        }
    }
        
    }
}
// for(const number of myCollection){
//     console.log(number)
// }

const countdown={
    value:[1,2,3,4,5],
    [Symbol.iterator](){
        let idx=this.value.length-1;
        return{
            next:()=>{
                if(idx>=0){
                    return {
                        value: this.value[idx--],
                        done:false
                    }

                }
                return{
                    value: undefined,
                    done:true,
                }
            },
            [Symbol.iterator](){
                return this;
            }
        }
    }

}
const iterator=countdown[Symbol.iterator]();
for (const number of iterator) {
    console.log(number);
}