const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),babel=require('@babel/core');
function load(file,mocks={}){const exports={};vm.runInNewContext(babel.transformSync(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code,{exports,require:name=>{assert.ok(name in mocks,name);return mocks[name];}});return exports;}
const geometry=load('utils/horizontalStrip.js');
test('equal shortcuts fit first, retain functional styles and reserve clear edges only on overflow',()=>{
 const slots=[];let index=0;const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),Children:{toArray:v=>v},cloneElement:(child,props)=>({...child,props:{...child.props,...props}}),forwardRef:fn=>fn,useImperativeHandle:()=>{},useRef:value=>slots[index++]||=({current:value}),useState:value=>{const i=index++;if(!(i in slots))slots[i]=value;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
 const Strip=load('components/HorizontalStrip.js',{react,'react-native':{View:'View',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:v=>v}},'@expo/vector-icons/MaterialCommunityIcons':'Icon','../theme':require('./theme-fixture.cjs'),'../utils/horizontalStrip':geometry}).default;
 const children=Array.from({length:5},()=>({type:'Pressable',props:{style:state=>({opacity:state.pressed?.5:1}),onPress:()=>{}}}));
 const render=(minimumItemWidth=65)=>{index=0;return Strip({equalItems:true,minimumItemWidth,children});};
 const nodes=t=>t.props.children.flat(Infinity).filter(Boolean);let tree=render();tree.props.onLayout({nativeEvent:{layout:{width:343}}});tree=render();let scroll=nodes(tree)[0];
 assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,0);const items=scroll.props.children[0];assert.ok(items.every(i=>i.props.style({pressed:true})[1].width===65.4));assert.equal(items[0].props.style({pressed:true})[0].opacity,.5);
 tree.props.onLayout({nativeEvent:{layout:{width:278}}});tree=render();scroll=nodes(tree)[0];assert.equal(scroll.props.style[1].marginHorizontal,28);assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,1);assert.equal(scroll.props.children[0][0].props.style({})[1].width,65);
 tree.props.onLayout({nativeEvent:{layout:{width:343}}});tree=render(130);assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,1,'Larger text keeps comfortable items and enables scrolling');
});
test('strip bounds expose only hidden ends and adapt to fit, resize and stale offsets',()=>{
 const {stripBounds:b}=geometry;assert.equal(b(0,800,0).overflow,false);assert.equal(b(300,250,0).overflow,false);
 const start=b(300,800,0);assert.equal(start.previous,false);assert.equal(start.next,true);assert.equal(start.maximum,556);
 assert.equal(b(300,800,100).previous,true);assert.equal(b(300,800,100).next,true);
 assert.equal(b(300,800,556).next,false);assert.equal(b(300,800,999).position,556);assert.equal(b(900,800,556).overflow,false);
});
test('native strip chevrons scroll, retain swipe callbacks and hide at both boundaries',()=>{
 const slots=[];let index=0;const calls=[];
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),forwardRef:fn=>fn,useImperativeHandle:()=>{},useRef:value=>slots[index++]||=( {current:value}),useState:value=>{const i=index++;if(!(i in slots))slots[i]=value;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
 const Strip=load('components/HorizontalStrip.js',{react,'react-native':{View:'View',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:v=>v}},'@expo/vector-icons/MaterialCommunityIcons':'Icon','../theme':require('./theme-fixture.cjs'),'../utils/horizontalStrip':geometry}).default;
 const render=()=>{index=0;return Strip({accessibilityLabel:'Filters',onScroll:()=>calls.push('swipe')});};
 const nodes=tree=>tree.props.children.flat(Infinity).filter(Boolean);let tree=render();tree.props.onLayout({nativeEvent:{layout:{width:300}}});let scroll=nodes(tree)[0];scroll.props.onContentSizeChange(800,70);scroll.props.ref.current={scrollTo:args=>calls.push(args)};
 tree=render();assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,1);nodes(tree).find(n=>n.type==='Pressable').props.onPress();assert.ok(calls[0].x>0);assert.equal(calls[0].animated,true);
 nodes(tree)[0].props.onScroll({nativeEvent:{contentOffset:{x:100}}});tree=render();assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,2);assert.ok(calls.includes('swipe'));
 nodes(tree)[0].props.onScroll({nativeEvent:{contentOffset:{x:556}}});tree=render();assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,1);assert.match(nodes(tree).find(n=>n.type==='Pressable').props.accessibilityLabel,/Scroll left/);
 nodes(tree)[0].props.onContentSizeChange(200,70);tree=render();assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,0);
});
