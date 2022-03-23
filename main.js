// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const ort = require('onnxruntime-web');

async function drawResult(canvas, decoder, x, y) {
    try {
        // prepare inputs. a tensor need its corresponding TypedArray as data
        const X = new ort.Tensor('float32', [x, y], [1, 2]);

        const feeds = { input: X };

        const X_out = await decoder.run(feeds);

        const data_X_out = X_out.output.data;

        imageData = new ImageData(new Uint8ClampedArray(data_X_out), 28, 28)
        offscreen = new OffscreenCanvas(28, 28);
        offscreenCtx = offscreen.getContext('2d');
        offscreenCtx.putImageData(imageData, 0,0)

        let rect = canvas.getBoundingClientRect();
        let ctx = canvas.getContext('2d')
        ctx.drawImage(offscreen, 0, 0, rect.width, rect.height)

    } catch (e) {
        document.write(`failed to inference ONNX model: ${e}.`);
    }
}

// use an async context to call onnxruntime functions.
async function setup(interactionCanvas, resultCanvas, encoder, decoder, scale) {
    interactionCtx = interactionCanvas.getContext('2d')

    interactionCtx.translate(interactionCanvas.width/2, interactionCanvas.height/2)
    interactionCtx.scale(scale*interactionCanvas.width/2, scale*interactionCanvas.height/2)

    interactionCtx.beginPath()
    interactionCtx.rect(-1/scale, -1/scale, 2/scale, 2/scale)
    interactionCtx.lineWidth = 0.1
    interactionCtx.stroke()

    drawAxis(interactionCtx, size=30)

    let ctx = resultCanvas.getContext('2d');
    ctx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

    decoder = await ort.InferenceSession.create(decoder);
    
    interactionCanvas.addEventListener("mousemove", function(e)
    {
        const {x, y} = getMousePosition(interactionCanvas, e);
        drawResult(resultCanvas, decoder, x, y)
    });

    encoder = await ort.InferenceSession.create(encoder)

    const X = await loadTensor("mnist_X.json")
    const Y = await loadTensor("mnist_Y.json")
    const feeds = { input: X };
    const Z = await encoder.run(feeds);

    for (let i = 0; i < X.dims[0]; i++) { 
        var hue = Math.floor((at(Y, [i])/10.0) * 360)
        interactionCtx.fillStyle = 'hsla('+ hue +',70%,50%,0.3)';

        point = {
            x: Z.output.data[2*i],
            y: Z.output.data[2*i+1]
        }

        interactionCtx.beginPath();
        pixelSizedPoint(interactionCtx, point, radius=3)
        interactionCtx.fill();
    }
}

async function main(){
    await setup(interactionCanvas=document.getElementById('ae_interaction'),
                resultCanvas=document.getElementById('ae_result'),
                encoder='ae_encoder.onnx',
                decoder='ae_decoder.onnx',
                scale = 1.0/20)
    await setup(interactionCanvas=document.getElementById('vae_interaction'),
                resultCanvas=document.getElementById('vae_result'),
                encoder='vae_encoder.onnx',
                decoder='vae_decoder.onnx',
                scale = 1.0/7)
}

async function loadTensor(jsonPath){
    var data = await fetch(jsonPath)
    data = await data.json()
    return new ort.Tensor('float32', Array.from(flatten(data)), shape(data));
}

function getMousePosition(canvas, event) {
    let rect = canvas.getBoundingClientRect();
    let ctx = canvas.getContext('2d')

    const point = {x: event.clientX - rect.left, y: event.clientY - rect.top};
    const matrix = ctx.getTransform().invertSelf();
    
    return transformPoint(matrix, point)
}

function transformPoint(matrix, point) {
    return  {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
}

function *flatten(array) {
    for (elt of array) 
      if (Array.isArray(elt)) yield *flatten(elt);
      else yield elt;
}

function shape(array) {
    function *shapegen(a){
        yield a.length
        if(Array.isArray(a[0]))
            yield *shape(a[0])
    }
    return [...shapegen(array)]
}

function at(tensor, indices){
    var index=0
    var dims = [...tensor.dims] // copy the array so we're not messing with dims
    for(var i=0; i<tensor.dims.length; i++){
        dims.shift()
        var p = dims.reduce( (a,b) => a * b, initialValue=1.0)
        index += indices[i]*p
    }
    return tensor.data[index]
}

function drawAxis(ctx, size) {

    ctx.strokeStyle = "#e1e1e1";
    for(var i = Math.ceil(-size); i<=size; i+=1){
        pixelSizedLine(ctx, 
            from =  { x: i, y: -size }, 
            to =    { x: i, y: size }, 
            width=1)
        pixelSizedLine(ctx, 
            from =  { x: -size, y: i }, 
            to =    { x: size, y: i }, 
            width=1)
    }

    ctx.strokeStyle = "#000000";
    pixelSizedLine(ctx, 
        from =  { x: 0, y: -size }, 
        to =    { x: 0, y: size }, 
        width=1)
    pixelSizedLine(ctx, 
        from =  { x: -size, y: 0 }, 
        to =    { x: size, y: 0 }, 
        width=1)
}

function pixelSizedPoint(ctx, point, radius) {
    pixelSizedDrawing(ctx, (t) => {
        point = transformPoint(matrix=t, point=point)
        ctx.arc(point.x, point.y, radius, 0, 2*Math.PI)
    })
}

function pixelSizedLine(ctx, from, to, width) {
    pixelSizedDrawing(ctx, (t) => {
        ctx.lineWidth = width
        from = transformPoint(matrix=t, point=from)
        to = transformPoint(matrix=t, point=to)
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
    })
}

function pixelSizedDrawing(ctx, f){
    const t = ctx.getTransform()
    ctx.resetTransform()
    f(t)
    ctx.setTransform(t)
}

main();