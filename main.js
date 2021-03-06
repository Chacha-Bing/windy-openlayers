var mapCanvas = document.getElementById("canvas");
var showVelocity = document.getElementById("showColumn");
var responseData;
var setTimeoutID;

mapCanvas.width = $(window).get(0).innerWidth;
mapCanvas.height = $(window).get(0).innerHeight;

var map = new ol.Map({
  target: 'map',
  layers:[
    new ol.layer.Tile({
      source: new ol.source.BingMaps({
        key: 'AvzM4FgDkpuZwkwP9DPDUwq15NUTJxHNyyUHGSXiA9JwAtAinnlPS31PvwB3hcWh',
        imagerySet: 'Aerial'
      }),
      name: "Bing 航天图",
    }),
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([150, -18]),
    zoom: 5,
    minZoom: 3,
    maxZoom: 13
  }),
  controls: ol.control.defaults({
    attributionOptions: ({
      collapsible: true
    }),
    rotate: false,
    zoom: false					
  })
});

$.getJSON({
  url: './src/wind-gbr.json',
  success: function(response){
    responseData = response;
  }
});
//prepare animate
function postMapRender(){
  moveendFlag = 1;
  mapCanvas.style.zIndex = 0;
  if(windVelocityArray.length == 0){
    buildWindVelocityArray();
  }
  
  clearCanvas()
  getBounds();
  animate();
}
$('#myButton').click(postMapRender);

var colorTable = [
          "rgb(36,104, 180)", "rgb(60,157, 194)", "rgb(128,205,193)", "rgb(151,218,168)", "rgb(198,231,181)",
          "rgb(238,247,217)", "rgb(255,238,159)", "rgb(252,217,125)", "rgb(255,182,100)", "rgb(252,150,75)",
          "rgb(250,112,52)", "rgb(245,64,32)", "rgb(237,45,28)", "rgb(220,24,32)", "rgb(180,0,35)"
        ];
var particleMaxAge = 100;
var zoomFlag;
var pixelWidth;
var pixelHeigh;
var windVelocityArray = [];
var WindVelocityGrid = [];
var particles = [];
var buckets = [];
var extent = [];

function getWindData(windVolecityX, windVolecityY){
  return {
    data: function data(p){
      return [windVolecityX[p], windVolecityY[p]];
    }
  };
}

//build the wind-volecity array which like a grid for interpolation, and that it is built once is enough
function buildWindVelocityArray(){	
  var windVolecityX = responseData[0].data;
  var windVolecityY = responseData[1].data;
  var getData = getWindData(windVolecityX, windVolecityY);
  //the scale of the array： nx*ny
  var numberX = responseData[0].header.nx;
  var numberY = responseData[0].header.ny;
  var p = 0;
  for(let j = 0; j < numberY; j++){
    var windRow = [];
    for(let i = 0; i < numberX; i++, p++){
      windRow[i] = getData.data(p);
    }
    windVelocityArray[j] = windRow;
  }
}

function getBounds(){
  extent = [];
  var lonStart = responseData[0].header.lo1;
  var latStart = responseData[0].header.la1;
  var lonEnd = responseData[0].header.lo2;
  var latEnd = responseData[0].header.la2;
  var start = [lonStart, latStart];
  var end = [lonEnd, latEnd];
  var extentStartCoordinate = ol.proj.fromLonLat(start);
  var extentEndCoordinate = ol.proj.fromLonLat(end);

  var controls;
  var sizeXY = map.getSize();
  var topLeftXY =  map.getCoordinateFromPixel([0,0]);
  var topLeftLonLat = ol.proj.toLonLat(topLeftXY);
  var bottomRightXY =  map.getCoordinateFromPixel(sizeXY);
  var bottomRightLonLat = ol.proj.toLonLat(bottomRightXY);
  
  //to judge is current range within the given range
  if((topLeftLonLat[0] > lonStart) && (topLeftLonLat[1] < latStart)
    && (bottomRightLonLat[0] < lonEnd) && (bottomRightLonLat[1] > latEnd)){
      zoomFlag = 0;
      extent = [
        0, 0,
        sizeXY[0], sizeXY[1]
      ]
    }
  else{
    zoomFlag = 1;
  }
  
  var extentStartPixel = map.getPixelFromCoordinate(extentStartCoordinate);
  var extentEndPixel = map.getPixelFromCoordinate(extentEndCoordinate);
  extent = [
        Math.round(extentStartPixel[0]), Math.round(extentStartPixel[1]),
        Math.round(extentEndPixel[0]), Math.round(extentEndPixel[1])
  ];

  //the span of one grid, degree as its unit
  var nx = responseData[0].header.dx;
  var ny = responseData[0].header.dy;
  //the number of grids should be one less than the rulers
  var numberX = responseData[0].header.nx - 1;
  var numberY = responseData[0].header.ny - 1;
  //the number of pixels in one grid of two directions
  var pixelPerGridX = (extent[2] - extent[0]) / numberX;
  var pixelPerGridY = (extent[3] - extent[1]) / numberY;
  var pixelPerGrid = [Math.ceil(pixelPerGridX), Math.ceil(pixelPerGridY)];

  buildWindVelocityGrid(pixelPerGrid, sizeXY, extentStartPixel);
}

//build the wind-volecity interpolation grid
function buildWindVelocityGrid(pixelPerGrid, sizeXY, extentStartPixel){
  WindVelocityGrid = [];

  if(zoomFlag == 0){
    pixelWidth = sizeXY[0];
    pixelHeigh = sizeXY[1];

    //to save calculation resource, take 4 adjacent elements as the same in default, which is not that accurate at first
    for(let j = 0; j < pixelHeigh; j+=4){
      var pixelRow = [];
      for(let i = 0; i < pixelWidth; i+=4){
        pixelRow[i] = interpolateWindVelocity(i + Math.abs(extentStartPixel[0]), j + Math.abs(extentStartPixel[1]), pixelPerGrid);
        pixelRow[i + 3] = pixelRow[i + 2] = pixelRow[i + 1] = pixelRow[i];
      }
      WindVelocityGrid[j + 3] = WindVelocityGrid[j + 2] = WindVelocityGrid[j + 1] = WindVelocityGrid[j] = pixelRow;					
    }
  }
  else{
    pixelWidth = extent[2] - extent[0];
    pixelHeigh = extent[3] - extent[1];

    for(let j = 0; j < pixelHeigh; j+=4){
      var pixelRow = [];
      for(let i = 0; i < pixelWidth; i+=4){
        pixelRow[i] = interpolateWindVelocity(i, j, pixelPerGrid);
        pixelRow[i + 3] = pixelRow[i + 2] = pixelRow[i + 1] = pixelRow[i];
      }
      WindVelocityGrid[j + 3] = WindVelocityGrid[j + 2] = WindVelocityGrid[j + 1] = WindVelocityGrid[j] = pixelRow;					
    }
  }
  
  addParticles(pixelWidth, pixelHeigh);
}

//fetch the corresponding data for interpolation
function interpolateWindVelocity(x, y, pixelPerGrid){
  var gridXDecimal = x / pixelPerGrid[0];
  var gridYDecimal = y / pixelPerGrid[1];
  var gridX = Math.floor(gridXDecimal);
  var gridY = Math.floor(gridYDecimal);
  var gridNextX = gridX + 1;
  var gridNextY = gridY + 1;
  var absoluteX = gridXDecimal - gridX;
  var absoluteY = gridYDecimal - gridY;

  var row = windVelocityArray[gridY];
  var gridTopLeft  = row[gridX];
  var gridTopRight = row[gridNextX];
  row = windVelocityArray[gridNextY];
  var gridBottomLeft  = row[gridX];
  var gridBottomRight = row[gridNextX];

  return bilinearInterpolateVector(absoluteX, absoluteY, gridTopLeft, gridTopRight, gridBottomLeft, gridBottomRight);
}

//core function: bilinearInterpolateVector
function bilinearInterpolateVector(x, y, g00, g10, g01, g11){
  var rx = 1 - x;
  var ry = 1 - y;
  var a = rx * ry,
    b = x * ry,
    c = rx * y,
    d = x * y;
  var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
  var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;

  return [u, v, Math.sqrt(u * u + v * v)];
}

function addParticles(pixelWidth, pixelHeigh){
  var zoomNow = map.getView().getZoom();
  // var particleCountScale /= (zoomNow / 4);
  // controls.particleCount = pixelWidth * pixelHeigh * particleCountScale;

  //important! Every time when you redraw the canvas, you should initialize the array, and all the last data will be remained
  particles = [];
  for(let i = 0; i < controls.particleCount; i++){
    particles[i] = particleRandomize();
  }

  var topLeftXY =  map.getCoordinateFromPixel([0,0]);
  var topLeftLonLat = ol.proj.toLonLat(topLeftXY);
  addMyOverlay(topLeftLonLat);
}

controls = new function () {
  this.slowScale = 6;
  this.particleCount = 1198;
}
var gui = new dat.GUI();
gui.add(controls, 'slowScale', 0.4, 20);
gui.add(controls, 'particleCount', 100, 10000).onChange(function () {
  if(moveendFlag){
    clearCanvas();
    if(windVelocityArray.length == 0){
      buildWindVelocityArray();
    }
    getBounds();
    animate();
  }
});

function particleRandomize(){
  var pixelWidth = extent[2] - extent[0];
  var pixelHeigh = extent[3] - extent[1];
  var x = Math.random() * pixelWidth;
  var y = Math.random() * pixelHeigh;
  var age = Math.random() * particleMaxAge;

  return getNewParticleSingle(x, y, age);
}

function getNewParticleSingle(x, y, age){
  var particleSingle = {
    x: 0,
    y: 0,
    age: 0,
    xt: 0,
    yt: 0,
    strong: 0
  };

  if(zoomFlag == 0){
    particleSingle.x = x;
    particleSingle.y = y;
  }
  else{
    particleSingle.x = x + extent[0];
    particleSingle.y = y + extent[1];
  }
  particleSingle.age = age;

  return particleSingle;
}

function getPointWindData(x, y){
  var row, data;
  if((row = WindVelocityGrid[y])){
    if((data = row[x])){
      return data;
    }
  }
    
  return [NaN, NaN, null];
}

function drawParticles(){
  var ctx = mapCanvas.getContext('2d');
  ctx.lineWidth = 1;

  //implement the particle-wake effect
  ctx.globalAlpha = 0.8;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  ctx.globalCompositeOperation = "source-over";
  
  buckets.forEach(function (bucket, i) {
    ctx.strokeStyle = colorTable[i];

    bucket.forEach(function (particle) {
      if(particle.age < particleMaxAge){
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.xt, particle.yt);
        particle.x = particle.xt;
        particle.y = particle.yt;
        ctx.closePath();
        ctx.stroke();
      }
    });
  });
}

function changeParticle(particle){
  var newParticle = particleRandomize();
  particle.x = newParticle.x;
  particle.y = newParticle.y;
  particle.age = newParticle.age;
  particle.xt = newParticle.xt;
  particle.yt = newParticle.yt;
  particle.strong = newParticle.strong;
}

function initializeBuckets(){
  for(let i = 0; i < colorTable.length; i++){
    buckets[i] = [];
  }
}

function updataParticlePosition(){
  initializeBuckets();

  particles.forEach(function (particle){
    if(particle.age > particleMaxAge){
      changeParticle(particle);
    }
    
    var pointWindData;
    if(zoomFlag == 0){
      pointWindData = getPointWindData(Math.floor(particle.x), Math.floor(particle.y));
    }
    else{
      pointWindData = getPointWindData(Math.floor(particle.x) - extent[0], Math.floor(particle.y) - extent[1]);
    }
    particle.strong = pointWindData[2];
    if((particle.strong == null) || (particle.strong == 0)){
      particle.age = particleMaxAge;
    }
    else{
      particle.xt = particle.x + pointWindData[0]/controls.slowScale;
      particle.yt = particle.y + pointWindData[1]/controls.slowScale;
      //if you want to slow your particles down but not looks like the animation slow down, then you can change
      //pointWindData[...] to pointWindData[...]/i, the bigger param'i' is, and slower the speed of particles is,
      // meanwhile you should increase the opacity of the particle-wake to get a better visual effect.
    }
    particle.age++;

    var drawColorNumber = Math.ceil(particle.strong * 2);
    drawColorNumber = Math.min(drawColorNumber, 14);
    buckets[drawColorNumber].push(particle);
  })
}

function animate(){
  updataParticlePosition();
  drawParticles();

  setTimeoutID = setTimeout(animate,80);
}

function addMyOverlay(topLeftLonLat){
  var myOver = new ol.Overlay({
    element: canvas,
    position: new ol.proj.fromLonLat(topLeftLonLat),
    stopEvent: false
  })
  map.addOverlay(myOver);
}

function clearCanvas(){
  if(setTimeoutID){
    clearTimeout(setTimeoutID);
  }

  var ctx = mapCanvas.getContext('2d');
  ctx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
}

var moveendFlag = 0;
map.on('movestart', function () {
  if(moveendFlag){
    clearCanvas();
  }
});
map.on('moveend', function () {
  if(moveendFlag){
    clearCanvas();
    if(windVelocityArray.length == 0){
      buildWindVelocityArray();
    }
    getBounds();
    animate();
  }
});

map.on('pointermove', function (evt) {
  var coordinateNow = evt.coordinate;
  var lonLatNow = ol.proj.toLonLat(coordinateNow);

  var pixelXabsolute = evt.pixel[0];
  var pixelYabsolute = evt.pixel[1];

  var pixelVelocity;
  if(zoomFlag == 0){
    pixelVelocity = getPointWindData(Math.floor(pixelXabsolute), Math.floor(pixelYabsolute));
  }
  else{
    pixelVelocity = getPointWindData(Math.floor(pixelXabsolute - extent[0]), Math.floor(pixelYabsolute - extent[1]));
  }

  if(pixelVelocity[2] == null){
    showVelocity.innerHTML = "<strong>此处位置:</strong>[" + lonLatNow[0].toFixed(2) + "°, " + lonLatNow[1].toFixed(2) + 
      "°]&nbsp;&nbsp;<strong>此处风速:</strong> 无数据" + "&nbsp;(zoom = " + map.getView().getZoom() + ")";
  }
  else{
    showVelocity.innerHTML = "<strong>此处位置:</strong>[" + lonLatNow[0].toFixed(2) + "°, " + lonLatNow[1].toFixed(2) + 
      "°]&nbsp;&nbsp;<strong>此处风速:</strong>" + pixelVelocity[2].toFixed(2) + "m/s" + "&nbsp;(zoom = " + map.getView().getZoom() + ")";
  }
})