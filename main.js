// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const ort = require('onnxruntime-web');

// TODO figure out how webpack handles modules & make these regions modules
//#region minigraphics
class Frame {
    constructor(canvas, normalize=true, scale=1.0) {
        this.elements = []

        this.canvas = canvas
        this.context = canvas.getContext('2d')

        if(normalize) {
            this.context.translate(canvas.width/2, canvas.height/2)
            this.context.scale(scale*canvas.width/2, scale*canvas.height/2)
        }
    }

    draw() {
        this.clear()
        for(const element of this.elements) {
            element.draw(this.context)
        }
    }

    clear(){
        this.context.save()
        this.context.setTransform(1,0,0,1,0,0)
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
        this.context.restore()
    }

    addElement(element) {
        this.elements.push(element)
    }
}

class Vector {
    constructor(x, y) {
        this.x=x
        this.y=y
    }

    transform(matrix) {
        return new Vector(matrix.a * this.x + matrix.c * this.y + matrix.e,
                          matrix.b * this.x + matrix.d * this.y + matrix.f)
    }

    add(other) {
        return new Vector(this.x+other.x, this.y+other.y)
    }

    subtract(other) {
        return new Vector(this.x-other.x, this.y-other.y)
    }

    length() {
        return Math.sqrt(this.x*this.x + this.y*this.y)
    }

    distance(other) {
        return other.subtract(this).length()
    }
}

class PointElement {
    constructor(position, radius=3, fillStyle='#000000') {
        this.position=position
        this.radius=radius
        this.fillStyle=fillStyle
    }

    draw(context) {
        // TODO low prio do this in the frame, once, for efficiency
        context.save()
        context.fillStyle = this.fillStyle
        const t = context.getTransform()
        context.resetTransform()

        var position = this.position.transform(t)

        context.beginPath()
        context.arc(position.x, position.y, this.radius, 0, 2*Math.PI)
        context.fill()

        //context.setTransform(t)
        context.restore()
    }
}

// function pixelSizedDrawing(ctx, f){
//     const t = ctx.getTransform()
//     ctx.resetTransform()
//     f(t)
//     ctx.setTransform(t)
// }
//#endregion minigraphics

//#region main
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

    const X = await loadTensor("data/mnist_X.json")
    const Y = await loadTensor("data/mnist_Y.json")
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
        pixelSizedPoint(interactionCtx, point, radius=2)
        interactionCtx.fill();
    }
}

async function setupArchitecture(inputCanvas, latentCanvas, outputCanvas, encoder, decoder, inputs) {
    
    latentScale = 1.0/4
    latentFrame = new Frame(latentCanvas, true, latentScale)

    const X = await loadTensor("data/mnist_X.json")
    const Y = await loadTensor("data/mnist_Y.json")
    const feeds = { input: X };
    
    encoder = await ort.InferenceSession.create(encoder)
    const Z = await encoder.run(feeds);

    const latentVectors = []

    for (let i = 0; i < X.dims[0]; i++) {
        const hue = Math.floor((at(Y, [i])/10.0) * 360)
        //const fillStyle = 'hsla('+ hue +',70%,50%,0.3)'
        const fillStyle = 'hsla(241, 83%, 24%,0.08)'

        const position = new Vector(Z.output.data[2*i], Z.output.data[2*i+1])
        const pointElement = new PointElement(position, 3, fillStyle)
        latentFrame.addElement(pointElement)
        latentVectors.push(position)
    }

    decoder = await ort.InferenceSession.create(decoder)
    var highlightPoint

    var inferenceIsRunning = false

    var onMove = async function(e)
    {
        e.preventDefault();
        e.stopPropagation();
        
        if(inferenceIsRunning){
            return
        }
        inferenceIsRunning = true
        
        const mouse = getMousePosition(latentCanvas, e);
        
        // Drawing result to Output canvas. This should always be the first thing we do.
        try {
            // prepare inputs. a tensor need its corresponding TypedArray as data
            const Z = new ort.Tensor('float32', [mouse.x, mouse.y], [1, 2]);
            const feeds = { input: Z };
            const X_out = await decoder.run(feeds);
    
            const data_X_out = X_out.output.data;
    
            imageData = new ImageData(new Uint8ClampedArray(data_X_out), 28, 28)
            offscreen = new OffscreenCanvas(28, 28);
            offscreenCtx = offscreen.getContext('2d');
            offscreenCtx.putImageData(imageData, 0,0)
    
            let rect = outputCanvas.getBoundingClientRect();
            let ctx = outputCanvas.getContext('2d')
            ctx.drawImage(offscreen, 0, 0, rect.width, rect.height)
    
        } catch (e) {
            console.log(`failed to inference ONNX model: ${e}.`);
        }
        
        var minDist = Infinity
        var minDistIndex

        for(var i=0; i<latentVectors.length; i++) {
            const d = latentVectors[i].distance(mouse)
            if(d < minDist) {
                minDist = d
                minDistIndex = i
            }
        }
        const minDistPosition = latentVectors[minDistIndex]

        if(highlightPoint == null) {
            highlightPoint = new PointElement(minDistPosition, 10)
            latentFrame.addElement(highlightPoint)
        } else {
            highlightPoint.position = minDistPosition;
        }
        latentFrame.draw()

        offscreen = new OffscreenCanvas(28, 28);
        offscreenCtx = offscreen.getContext('2d');
        var imgData = offscreenCtx.createImageData(28, 28); // width x height
        var data = imgData.data;
        // copy img byte-per-byte into our ImageData
        for (var i = 0; i < 28*28; i++) {
            data[i*4] = X.data[i + 28*28*minDistIndex] * 255;
            data[i*4+1] = X.data[i + 28*28*minDistIndex] * 255
            data[i*4+2] = X.data[i + 28*28*minDistIndex] * 255
            data[i*4+3] = 255
        }
        // now we can draw our imagedata onto the canvas
        offscreenCtx.putImageData(imgData, 0, 0);

        let rect = inputCanvas.getBoundingClientRect();
        let ctx = inputCanvas.getContext('2d')
        ctx.drawImage(offscreen, 0, 0, rect.width, rect.height)
        
        inferenceIsRunning = false
    };

    latentCanvas.addEventListener("mousemove", onMove);
    latentCanvas.addEventListener("touchmove", onMove);

    latentFrame.draw()
}


async function main(){
    await setupArchitecture(inputCanvas=document.getElementById('architectureInput'),
                            latentCanvas=document.getElementById('architectureLatent'),
                            outputCanvas=document.getElementById('architectureOutput'),
                            encoder='architecture_encoder.onnx',
                            decoder='architecture_decoder.onnx')

    // await setup(interactionCanvas=document.getElementById('ae_interaction'),
    //             resultCanvas=document.getElementById('ae_result'),
    //             encoder='ae_encoder.onnx',
    //             decoder='ae_decoder.onnx',
    //             scale = 1.0/20)
    // await setup(interactionCanvas=document.getElementById('vae_interaction'),
    //             resultCanvas=document.getElementById('vae_result'),
    //             encoder='vae_encoder.onnx',
    //             decoder='vae_decoder.onnx',
    //             scale = 1.0/7)
}

async function loadTensor(jsonPath){
    var data = await fetch(jsonPath)
    data = await data.json()
    return new ort.Tensor('float32', Array.from(flatten(data)), shape(data));
}

function getMousePosition(canvas, event) {
    let rect = canvas.getBoundingClientRect();
    let ctx = canvas.getContext('2d')

    // const point = {x: event.clientX - rect.left, y: event.clientY - rect.top};
    const vector = new Vector(event.clientX - rect.left, event.clientY - rect.top)
    const matrix = ctx.getTransform().invertSelf();
    
    // return transformPoint(matrix, point)
    return vector.transform(matrix)
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

// TODO redesign this
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
//#endregion main

main();