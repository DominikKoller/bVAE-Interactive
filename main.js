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
        window.requestAnimationFrame(this.frameLoop.bind(this))
    }

    frameLoop() {
        this.draw()
        this.update()
        this.cancellationID = window.requestAnimationFrame(this.frameLoop.bind(this))
    }

    draw() {
        this.clear()
        for(const element of this.elements) {
            element.draw(this.context)
        }
    }

    update() {
        for(const element of this.elements) {
            if (typeof element.update === "function") { 
                element.update()
            }
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

    removeElement(element) {
        const index = this.elements.indexOf(element);
        if (index > -1) {
            this.elements.splice(index, 1); // 2nd parameter means remove one item only
        }
    }

    destroy() {
        if(typeof this.cancellationID !== "undefined") {
            window.cancelAnimationFrame(this.cancellationID);
        }
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

class RotatingRectangleElement {
    constructor(position, size, fillStyle='#000000') {
        this.position = position
        this.size = size
        this.fillStyle = fillStyle
        this.rotation = 0.0
    }

    draw(context) {
        context.save()
        context.fillStyle = this.fillStyle
        context.translate(this.position.x, this.position.y)
        context.rotate(this.rotation)
        context.beginPath()
        context.rect(-this.size.x/2.0, -this.size.y/2.0, this.size.x, this.size.y);
        context.fill()
        context.restore()
    }

    update() {
        this.rotation = this.rotation + 0.05
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

var onDestroy

async function setupArchitecture(inputCanvas, latentCanvas, outputCanvas, encoder, decoder, inputs) {
    
    if (typeof onDestroy === "function") { 
        onDestroy()
        console.log("on destroy. removing listeners")
    }

    latentCanvas.style.backgroundColor = "white"
    latentScale = 1.0/4
    latentFrame = new Frame(latentCanvas, true, latentScale)
    // window.requestAnimationFrame(latentFrame.frameLoop.bind(latentFrame))

    // hack
    const loadingIcon = new RotatingRectangleElement(
        new Vector(0.0,0.0),
        new Vector(2.5, 2.5),
        "#222233")
    latentFrame.addElement(loadingIcon)

    const X = await loadTensor("data/mnist_X.json")
    const Y = await loadTensor("data/mnist_Y.json")
    const feeds = { input: X };
    
    encoder = await ort.InferenceSession.create(encoder)
    const Z = await encoder.run(feeds);

    const latentVectors = []

    for (let i = 0; i < X.dims[0]; i++) {
        const hue = Math.floor((at(Y, [i])/10.0) * 360)
        //const fillStyle = 'hsla('+ hue +',70%,50%,0.3)'
        //const fillStyle = 'hsla(241, 83%, 24%,0.08)'

        const position = new Vector(Z.output.data[2*i], Z.output.data[2*i+1])
        //const pointElement = new PointElement(position, 3, fillStyle)
        // latentFrame.addElement(pointElement)
        latentVectors.push(position)
    }

    decoder = await ort.InferenceSession.create(decoder)

    latentFrame.removeElement(loadingIcon)
    latentCanvas.style.background = "none" //HACK
    var highlightPoint

    var inferenceIsRunning = false
    var isSetup = false //hack

    var onMove = async function(position)
    {
        if(!isSetup) {
            try {
                for(const position of latentVectors) {
                    const pointElement = new PointElement(position, 3, 'hsla(241, 83%, 24%,0.08)')
                    latentFrame.addElement(pointElement)
                }
            }
            finally {
                isSetup = true
            }
        }
        if(inferenceIsRunning){
            return
        }
        inferenceIsRunning = true
        try {
        
        // Drawing result to Output canvas. This should always be the first thing we do.
        try {
            // prepare inputs. a tensor need its corresponding TypedArray as data
            const Z = new ort.Tensor('float32', [position.x, position.y], [1, 2]);
            const feeds = { input: Z };
            const X_out = await decoder.run(feeds);
    
            const data_X_out = X_out.output.data;
    
            imageData = new ImageData(new Uint8ClampedArray(data_X_out), 28, 28)
            let ctx = outputCanvas.getContext('2d')
            ctx.putImageData(imageData, 0, 0);
    
        } catch (e) {
            console.log(`failed to inference ONNX model: ${e}.`);
        }
        
        var minDist = Infinity
        var minDistIndex

        for(var i=0; i<latentVectors.length; i++) {
            const d = latentVectors[i].distance(position)
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

        let ctx = inputCanvas.getContext('2d')
        var imgData = ctx.createImageData(28, 28);
        var data = imgData.data;
        // copy img byte-per-byte into our ImageData
        for (var i = 0; i < 28*28; i++) {
            data[i*4] = X.data[i + 28*28*minDistIndex] * 255;
            data[i*4+1] = X.data[i + 28*28*minDistIndex] * 255
            data[i*4+2] = X.data[i + 28*28*minDistIndex] * 255
            data[i*4+3] = 255
        }
        // now we can draw our imagedata onto the canvas
        ctx.putImageData(imgData, 0, 0);
        } finally {
        inferenceIsRunning = false
        }
    };

    function onMousemove(e) {
        e.preventDefault();
        e.stopPropagation();

        // kinda a hack
        latentCanvas.style.backgroundColor = "white";
        let clientPosition = new Vector(e.clientX, e.clientY);
        let position = getMousePosition(latentCanvas, clientPosition);
        onMove(position)
    }

    function onTouchmove(e) {
        e.preventDefault();
        e.stopPropagation();

        // kinda a hack
        latentCanvas.style.backgroundColor = "white";
        let clientPosition = new Vector(e.touches[0].clientX, e.touches[0].clientY);
        let position = getMousePosition(latentCanvas, clientPosition);
        onMove(position)
    }

    latentCanvas.addEventListener("mousemove", onMousemove);
    latentCanvas.addEventListener("touchmove", onTouchmove);

    onDestroy = function() {
        latentCanvas.removeEventListener("mousemove", onMousemove);
        latentCanvas.removeEventListener("touchmove", onTouchmove);
        latentFrame.destroy();
    }
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

function getMousePosition(canvas, clientPosition) {
    let rect = canvas.getBoundingClientRect();
    let ctx = canvas.getContext('2d')

    var widthScale = canvas.width / rect.width;
    var heightScale = canvas.height / rect.height;

    // const point = {x: event.clientX - rect.left, y: event.clientY - rect.top};
    const vector = new Vector(
        (clientPosition.x - rect.left) * widthScale, 
        (clientPosition.y - rect.top) * heightScale
        )
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