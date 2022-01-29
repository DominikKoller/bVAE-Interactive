// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const ort = require('onnxruntime-web');

var ctx;
var decoder;

async function drawResult(x, y) {
    try {

        x = (x-0.5) * 10
        y = (y-0.5) * 10

        // prepare inputs. a tensor need its corresponding TypedArray as data
        const X = new ort.Tensor('float32', [x, y], [1, 2]);

        const feeds = { input: X };

        const X_out = await decoder.run(feeds);

        const data_X_out = X_out.output.data;

        // read from results
        console.log(data_X_out)
        console.log("get")
        ctx_imageData = ctx.getImageData(0,0, 28, 28)
        console.log("set")

        ctx_imageData.data.set(new Uint8ClampedArray(data_X_out))
        console.log("put")

        ctx.putImageData(ctx_imageData, 0,0)
        // ctx.putImageData(data_X_out, 0,0)
        //const dataC = results.c.data;
        // console.log(data_X_out)
        // document.write(`data of result tensor': ${data_X_out}`);
        // document.write('hellloo')

    } catch (e) {
        document.write(`failed to inference ONNX model: ${e}.`);
    }
}

// use an async context to call onnxruntime functions.
async function main() {
    console.log("what")
    const interactionCanvas = document.getElementById('interaction')
    const interactionCtx = interactionCanvas.getContext('2d')

    interactionCtx.beginPath();
    interactionCtx.rect(0, 0, interactionCanvas.width, interactionCanvas.height);
    interactionCtx.lineWidth = 10
    interactionCtx.stroke();

    var canvas = document.getElementById('result');
    ctx = canvas.getContext('2d');
    ctx.fillRect(10, 10, 50, 50);

    decoder = await ort.InferenceSession.create('./decoder.onnx');
    
    interactionCanvas.addEventListener("mousemove", function(e)
    {
        const {x, y} = getMousePosition(interactionCanvas, e);
        drawResult(x, y)
    });
}

function getMousePosition(canvas, event) {
    let rect = canvas.getBoundingClientRect();
    return {x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top)/rect.height }
}

main();