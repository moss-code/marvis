
// ===================== 配色 =====================
var colors = ['#B5835A','#8A9B6E','#C96F4A','#D9B98C','#7A6A53'];

// ===================== 图表1：各营业厅总业绩对比 =====================
var chart1 = echarts.init(document.getElementById('chart1'));
var hallNames = ['城东营业厅','高新区营业厅','城北营业厅','城南营业厅','老城口营业厅','城西营业厅'];
chart1.setOption({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor:'rgba(255,255,255,0.95)', borderColor:'#B5835A', borderWidth:1 },
  legend: { data: ['宽带新装(户)','套餐办理(笔)','新增用户(户)'], bottom:0, textStyle:{color:'#5A4A3A',fontSize:13} },
  grid: { left:80, right:40, top:20, bottom:50 },
  xAxis: { type:'category', data:hallNames, axisLabel:{color:'#5A4A3A',fontSize:12}, axisLine:{lineStyle:{color:'#D9C8B8'}} },
  yAxis: [
    { type:'value', name:'数量', nameTextStyle:{color:'#7A6A53',fontSize:13}, axisLabel:{color:'#7A6A53'}, splitLine:{lineStyle:{color:'#F0E8E0',type:'dashed'}} },
    { type:'value', name:'数量', nameTextStyle:{color:'#7A6A53',fontSize:13}, axisLabel:{color:'#7A6A53'}, splitLine:{show:false} }
  ],
  series: [
    { name:'宽带新装(户)', type:'bar', data:[6516,6001,4706,4560,2321,2315], itemStyle:{color:colors[0],borderRadius:[4,4,0,0]}, barWidth:22 },
    { name:'套餐办理(笔)', type:'bar', data:[11491,10517,8073,7804,4083,4116], itemStyle:{color:colors[1],borderRadius:[4,4,0,0]}, barWidth:22 },
    { name:'新增用户(户)', type:'bar', data:[4213,4098,3110,2992,1484,1550], itemStyle:{color:colors[2],borderRadius:[4,4,0,0]}, barWidth:22 }
  ],
  backgroundColor:'transparent'
});

// ===================== 图表2：各营业厅投诉率排名（条形图） =====================
var chart2 = echarts.init(document.getElementById('chart2'));
var complaintHalls = ['城西营业厅','老城口营业厅','城南营业厅','城东营业厅','城北营业厅','高新区营业厅'];
var complaintRates = [2.03, 1.43, 1.05, 0.89, 0.79, 0.65];
var barColors = complaintRates.map(function(v) {
  if(v >= 2.0) return '#C96F4A';
  if(v >= 1.0) return '#D9B98C';
  return '#8A9B6E';
});
chart2.setOption({
  tooltip: { trigger:'axis', axisPointer:{type:'shadow'}, backgroundColor:'rgba(255,255,255,0.95)', borderColor:'#B5835A', borderWidth:1, formatter:function(params){ return params[0].name + '<br/>平均投诉率：<strong>' + params[0].value + '%</strong>'; } },
  grid: { left:120, right:60, top:20, bottom:30 },
  xAxis: { type:'value', name:'平均投诉率(%)', nameTextStyle:{color:'#7A6A53',fontSize:13}, max:2.5, axisLabel:{color:'#7A6A53'}, splitLine:{lineStyle:{color:'#F0E8E0',type:'dashed'}} },
  yAxis: { type:'category', data:complaintHalls, axisLabel:{color:'#5A4A3A',fontSize:13,fontWeight:500}, axisLine:{lineStyle:{color:'#D9C8B8'}} },
  series: [{
    type:'bar', data:complaintRates,
    itemStyle:{ color:function(params) { return barColors[params.dataIndex]; }, borderRadius:[0,6,6,0] },
    barWidth:30,
    label:{ show:true, position:'right', formatter:function(p){ return p.value + '%'; }, color:'#5A4A3A', fontSize:13, fontWeight:'bold' }
  }],
  backgroundColor:'transparent'
});

// ===================== 图表3：全年各月份业务趋势（双轴折线图） =====================
var chart3 = echarts.init(document.getElementById('chart3'));
var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
chart3.setOption({
  tooltip: { trigger:'axis', backgroundColor:'rgba(255,255,255,0.95)', borderColor:'#B5835A', borderWidth:1 },
  legend: { data:['宽带新装(户)','套餐办理(笔)','平均投诉率(%)'], bottom:0, textStyle:{color:'#5A4A3A',fontSize:13} },
  grid: { left:70, right:70, top:20, bottom:50 },
  xAxis: { type:'category', data:months, axisLabel:{color:'#5A4A3A',fontSize:12}, axisLine:{lineStyle:{color:'#D9C8B8'}} },
  yAxis: [
    { type:'value', name:'宽带 / 套餐', nameTextStyle:{color:'#7A6A53',fontSize:13}, axisLabel:{color:'#7A6A53'}, splitLine:{lineStyle:{color:'#F0E8E0',type:'dashed'}} },
    { type:'value', name:'投诉率(%)', nameTextStyle:{color:'#C96F4A',fontSize:13}, axisLabel:{color:'#C96F4A',formatter:'{value}%'}, splitLine:{show:false}, min:0.8, max:1.4 }
  ],
  series: [
    { name:'宽带新装(户)', type:'line', data:[1853,2051,2208,2369,2460,2457,2392,2246,2174,2024,2007,2178], smooth:true, symbol:'circle', symbolSize:8, lineStyle:{width:3,color:colors[0]}, itemStyle:{color:colors[0]}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(181,131,90,0.25)'},{offset:1,color:'rgba(181,131,90,0.02)']}}} },
    { name:'套餐办理(笔)', type:'line', data:[3301,3450,3913,4104,4206,4262,4142,4067,3777,3539,3600,3723], smooth:true, symbol:'diamond', symbolSize:8, lineStyle:{width:3,color:colors[1]}, itemStyle:{color:colors[1]}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(138,155,110,0.2)'},{offset:1,color:'rgba(138,155,110,0.02)']}}} },
    { name:'平均投诉率(%)', type:'line', yAxisIndex:1, data:[1.08,1.11,1.09,1.15,1.22,1.12,1.20,1.17,1.17,1.10,1.20,1.09], smooth:true, symbol:'triangle', symbolSize:9, lineStyle:{width:3,color:colors[2],type:'dashed'}, itemStyle:{color:colors[2]} }
  ],
  backgroundColor:'transparent'
});

// ===================== 图表4：城西营业厅"业务断崖"专题 =====================
var chart4 = echarts.init(document.getElementById('chart4'));
chart4.setOption({
  tooltip: { trigger:'axis', backgroundColor:'rgba(255,255,255,0.95)', borderColor:'#C96F4A', borderWidth:1 },
  legend: { data:['宽带新装(户)','套餐办理(笔)','投诉率(%)'], bottom:0, textStyle:{color:'#5A4A3A',fontSize:13} },
  grid: { left:70, right:70, top:20, bottom:50 },
  xAxis: { type:'category', data:months, axisLabel:{color:'#5A4A3A',fontSize:12}, axisLine:{lineStyle:{color:'#D9C8B8'}} },
  yAxis: [
    { type:'value', name:'业务量', nameTextStyle:{color:'#7A6A53',fontSize:13}, axisLabel:{color:'#7A6A53'}, splitLine:{lineStyle:{color:'#F0E8E0',type:'dashed'}} },
    { type:'value', name:'投诉率(%)', nameTextStyle:{color:'#C96F4A',fontSize:13}, axisLabel:{color:'#C96F4A',formatter:'{value}%'}, splitLine:{show:false}, min:1.0, max:3.0 }
  ],
  series: [
    { name:'宽带新装(户)', type:'line', data:[299,333,295,303,283,260,190,119,92,87,78,56], smooth:true, symbol:'circle', symbolSize:8, lineStyle:{width:3,color:colors[0]}, itemStyle:{color:colors[0]}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(181,131,90,0.3)'},{offset:1,color:'rgba(181,131,90,0.02)']}}} },
    { name:'套餐办理(笔)', type:'line', data:[541,551,533,545,507,505,340,217,175,166,137,97], smooth:true, symbol:'diamond', symbolSize:8, lineStyle:{width:3,color:colors[1]}, itemStyle:{color:colors[1]}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(138,155,110,0.25)'},{offset:1,color:'rgba(138,155,110,0.02)']}}} },
    { name:'投诉率(%)', type:'line', yAxisIndex:1, data:[1.55,1.56,1.60,1.55,1.72,1.66,1.74,2.21,2.48,2.43,2.37,2.30], smooth:true, symbol:'triangle', symbolSize:9, lineStyle:{width:3,color:'#C96F4A'}, itemStyle:{color:'#C96F4A'}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(201,111,74,0.2)'},{offset:1,color:'rgba(201,111,74,0.02)']}}} }
  ],
  backgroundColor:'transparent'
});
