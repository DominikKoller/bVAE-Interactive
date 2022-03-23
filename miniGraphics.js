// This is not used now because I had no patience to figure out modules in webpack
// TODO figure out modules in webpack

// class Frame {
//     constructor(canvas, normalize=true, scale=1.0) {
//         this.elements = []

//         this.canvas = canvas
//         this.context = canvas.getContext('2d')

//         if(normalize) {
//             this.context.translate(canvas.width/2, canvas.height/2)
//             this.context.scale(scale*canvas.width/2, scale*canvas.height/2)
//         }
//     }

//     draw() {
//         this.clear()
//         for(const element of this.elements) {
//             element.draw(this.context)
//         }
//     }

//     clear(){
//         this.context.save()
//         this.context.setTransform(1,0,0,1,0,0)
//         this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
//         this.context.restore()
//     }

//     addElement(element) {
//         this.elements.push(element)
//     }
// }

// class Vector {
//     constructor(x, y) {
//         this.x=x
//         this.y=y
//     }

//     transform(matrix) {
//         return new Vector(x=matrix.a * this.x + matrix.c * this.y + matrix.e,
//                           y=matrix.b * this.x + matrix.d * this.y + matrix.f)
//     }
// }

// class PointElement {
//     constructor(position, radius=3, fillStyle='#000000'){
//         this.position=position
//         this.radius=radius
//         this.fillStyle=fillStyle
//     }

//     draw(context) {
//         // TODO low prio do this in the frame, once, for efficiency
//         context.save()
//         context.fillStyle = this.fillStyle
//         const t = context.getTransform()
//         context.resetTransform()

//         position = this.position.transform(t)

//         context.beginPath()
//         context.arc(position.x, position.y, this.radius, 0, 2*Math.PI)
//         context.fill()

//         //context.setTransform(t)
//         context.restore()
//     }
// }

// function pixelSizedDrawing(ctx, f){
//     const t = ctx.getTransform()
//     ctx.resetTransform()
//     f(t)
//     ctx.setTransform(t)
// }