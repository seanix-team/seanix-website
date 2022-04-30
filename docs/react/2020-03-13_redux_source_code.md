---
title: '步步为营，探索经典状态管理器redux源码'
---
> 当静下心来想去读一些经典源码案例的时候，redux可能是一个好的开始，正如官方所说，它的体积只有2kb！学习源码，不一定要自己能够实现一个完全一样的，去了解一个具体的函数是如何写的，自己实现某个函数的功能会和这些经典源码相比差在哪里，这才是看源码最重要的因素。

当不知道从哪里开始看起的时候，从package.json中所定义的入口文件来看是一个不错的选择。redux进入入口index.ts的时候，主要做了三件事，导出typescript的类型声明、做了一个虚函数的判断（为了看你是不是在dev环境运行了生产环境中被最小化的redux版本）、导出了整个redux的顶级方法（也就是你可以通过`import { XXX } from 'redux'`取到的对象）。

```js
/**
* 定义了一个空方法，如果不处于生产环境，
* isCrushed这个函数的name属性存在且不等于isCrushed的时候，就会提示警告，让你去
* 使用loose-envify（https://github.com/zertosh/loose-envify）
* 或者设为webpack的mode为production
*/
function isCrushed() {}

if (
  -- process.env.NODE_ENV !== 'production' &&
  typeof isCrushed.name === 'string' &&
  isCrushed.name !== 'isCrushed'
) {
  warning(``)
}

export { XXX }
```
redux的顶级对象有：
-   [createStore(reducer, [preloadedState], [enhancer])](http://cn.redux.js.org/api/createstore)
-   [combineReducers(reducers)](http://cn.redux.js.org/api/combinereducers)
-   [applyMiddleware(...middlewares)](http://cn.redux.js.org/api/applymiddleware)
-   [bindActionCreators(actionCreators, dispatch)](http://cn.redux.js.org/api/bindactioncreators)
-   [compose(...functions)](http://cn.redux.js.org/api/compose)
- __DO_NOT_USE__ActionTypes

## Util工具包
在看redux源码之前，先了解源码中所用到的一些工具类是十分必要的。在读源码的时候能够更加轻松自如的应对，Util包中有许多我们能够学习的东西。
### actionTypes
这个文件指明了redux应用内置的一些action，用户在定义action的时候，要避免和这些雷同。

```js
const randomString = () =>
  Math.random().toString(36).substring(7).split('').join('.')

const ActionTypes = {
  INIT: `@@redux/INIT${/* #__PURE__ */ randomString()}`,
  REPLACE: `@@redux/REPLACE${/* #__PURE__ */ randomString()}`,
  PROBE_UNKNOWN_ACTION: () => `@@redux/PROBE_UNKNOWN_ACTION${randomString()}`
}
```
这里值得注意的点是，redux是如何生成随机数的，并不是我们想象的只要使用Math.random()就可以了。我们可以参照ES5的说明，所产生的数据是在[0, 1]之间，并且呈现大致的均匀分布。而想要产生目前最为准确的随机数，要去利用操作系统的能力，在Linux中，读取/dev/urandom文件（非阻塞随机数发生器），实际上是通过二进制数据保存实时数据的。

> **[15.8.2.14](https://link.zhihu.com/?target=https%3A//www.ecma-international.org/ecma-262/5.1/)** **random ( )**\
> Returns a Number value with positive sign, **greater than or equal to 0 but less than 1**, chosen randomly or pseudo randomly with approximately **uniform distribution over that range**, using an implementation-dependent algorithm or strategy. This function takes no arguments.

利用Math.random().toString(36)，toString方法其实包含了一个参数，表示转换的进制数，最大可以转成36进制，包含了[0-9][a-z]，总共36个字符。这样总共就有36^36种不同的随机组合，大大提升了均匀分布不同的可能性，取第7位到最后一位足以作为一个不重复的ID值。后续操作则是单独在每个字符之间加上了一个"."。

### isPlainObject
该函数主要是为了判断是否是简单对象的形式，这就涉及到原型链相关的知识了。在函数刚开始的时候就通过typeof来去传入的对象的类型，不是object或者对象为null，都返回false。函数声明了一个原型变量，用以存放最初的对象，以及对象原型。根据原型链，对象类型的尽头是null，在这之间，要经历多重循环遍历，通过Object.getPrototypeOf()拿到对应的原型。最后判断obj的prototype是否和proto变量是否一致。
```js
export default function isPlainObject(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) return false

  let proto = obj
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto)
  }

  return Object.getPrototypeOf(obj) === proto
}
```

可以通过这张图去看，一个对象变量的隐式原型__proto__指向它的构造函数的显示原型prototype，我们要判断dog实例是不是一个普通对象，proto变量经历两次变化，一次是向上找到Animal，再去找到Object，最后Object.getPrototypeOf(obj)获得到的是Animal和Object不一致，所以返回了false。
![C9859FFF-CB38-4060-B281-D9550D762EB1.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/bd9f2f086eeb4628a6ba59277a836d8e~tplv-k3u1fbpfcp-watermark.image?)
### kindOf
在redux应用里，kindOf.ts导出了两个函数kindOf和miniKindOf，其中kindOf针对production环境，而miniKindOf针对development环境。可以看到部分throw Error都对参数进行了判断，这时候作为开发这想知道报错参数的类型是什么，我们知道最简单的方法就是对参数进行`typeOf xxx`，但它对于复杂类型不能准确的进行判定，所以redux针对development环境做了更为细致的typeOf判断。整体思路：
1. 将void 0归类于undefined类型（**尚不清楚为什么要这么做，因为typeof void 0或者typeof undefined返回值的结果都是undefined，个人认为直接在switch语句里写就好了**），因为null会被判断为object类型，所以单独将null归类于null类型。
2. 对于typeof能判断的类型，直接返回判断结果。
3. 接下来判断三种类型，Array、Date以及Error，Array很好判断，通过Array对象的isArray方法就可以了。Date和Error类型，redux做了相关的拓展。基本思路是使用instanceof运算符检测构造函数的 `prototype` 属性是否出现在传入对象的原型链上。其次是传入对象满足某些具体的要求，也会被算作，例如Data类型，只要val包含message、constructor和constructor.stackTraceLimit === 'number'。
4. 当碰上除上述情况以外的类型呢？会先去调用ctorName方法获取构造函数的name属性，没有就返回null，然后列举出一些特殊的类型，如果有则返回对应的name。实在没有的情况下，比如说自定义的类型，就会做最后的处理。
```js
function isError(val: any) {
  return (
    val instanceof Error ||
    (typeof val.message === 'string' &&
      val.constructor &&
      typeof val.constructor.stackTraceLimit === 'number')
  )
}

function isDate(val: any) {
  if (val instanceof Date) return true
  return (
    typeof val.toDateString === 'function' &&
    typeof val.getDate === 'function' &&
    typeof val.setDate === 'function'
  )
}

function ctorName(val: any): string | null {
  return typeof val.constructor === 'function' ? val.constructor.name : null
}
```
```js
export function miniKindOf(val: any): string {
  if (val === void 0) return 'undefined'
  if (val === null) return 'null'

  const type = typeof val
  switch (type) {
    case 'boolean':
    case 'string':
    case 'number':
    case 'symbol':
    case 'function': {
      return type
    }
  }

  if (Array.isArray(val)) return 'array'
  if (isDate(val)) return 'date'
  if (isError(val)) return 'error'

  const constructorName = ctorName(val)
  switch (constructorName) {
    case 'Symbol':
    case 'Promise':
    case 'WeakMap':
    case 'WeakSet':
    case 'Map':
    case 'Set':
      return constructorName
  }

  // other
  return Object.prototype.toString
    .call(val)
    .slice(8, -1)
    .toLowerCase()
    .replace(/\s/g, '')
}
```
### 其他一些工具函数
- formatProdErrorMessage.ts --- 对生产环境下报错，根据错误代码链接到对应错误文档的redux官网
- warning.ts --- 在控制台中打印警告
- symbol-observable.ts --- 在example中会用到，对象会有一个私有属性。可以了解下```https://github.com/zenparsing/es-observable```

## createStore
createStore方法会创建一个存储库去维持整个应用的状态树，要改变这个存储库里所维持的状态，唯一的方式就是去调用dispatch方法，整个应用应该只有一个store对象，但是你可以创建多个reducer并通过combineReducers去形成一个单一的reduer。这是官方的建议的使用方法，因为在createStore这个API里，接受了三个参数，分别是:
-  reducer（接收当前action和state树，返回一个新的state树的函数）
-  preloadedState（初始化状态，如果用了combineReducer产生了一个root Reducer，就需要提供一个key值和各个reducer名称一致的object）
-  enhancer（可以用第三方第能力如中间价、时间旅行、持久化来增强 store，redux唯一内置的是# `applyMiddleware`）
### 函数重载
在createStore函数的ts定义中运用了函数重载的技巧，在大多数后端语言中也有函数重载这一说法，而ts的函数重载比较特殊，由一个实现签名和一个或多个重载签名构成，外部调用函数的时候，会根据所传递的参数类型，去调用实现签名下的函数体，重载签名是没有函数体的。ts中的函数重载本质上就是为了在多种不同参数传递的情况下提供明确的类型提示。这里有三种传参情况：
必须传递reducer，第二个参数可以为enhancer或者是preloadedState，第三个参数如果有则必须为enhancer。具体每个参数的ts类型分析，在之后的内容里会讲解。

```js
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
export default function createStore<
  S,
  A extends Action,
  Ext = {},
  StateExt = never
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S> | StoreEnhancer<Ext, StateExt>,
  enhancer?: StoreEnhancer<Ext, StateExt>
): Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext
```
在传递完参数之后，会对所传递的参数进行严格的校验，分以下情况（注意一定要从实现签名的函数参数视角去对照这个关系）：

![redux-params.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c306bb7cd8fc43968d9af75110b2767c~tplv-k3u1fbpfcp-watermark.image?)

### 观察者模式
createstore函数体里面，定义了一些变量，对传入的reducer和state做了一次拷贝，定义了一个监听器队列，用与存放观察者的回调函数（也就是调用store.subscribe传入的函数），然后做了一次监听器队列的拷贝，赋值给nextListeners，其中的isDispatching，顾名思义，就是判断是否在进行dispatch这个动作去修改状态树。

```js
let currentReducer = reducer
let currentState = preloadedState as S
let currentListeners: (() => void)[] | null = []
let nextListeners = currentListeners
let isDispatching = false
```
下面将从createStore的subscribe开始介绍，先看这个观察者模式的图，subscribe订阅函数会将监听回调添加到观察者列表中，当一个action在任何时候被dispatch之后，这个监听列表里的回调函数都会被调用。

![redux-subscribe.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d3a48940717a4772b6ab3ec3534ba54d~tplv-k3u1fbpfcp-watermark.image?)
我们首先看下ensureCanMutateNextListeners这个函数做了些什么事情。他将currentListener浅拷贝了一层，以便在调度时将nextListeners用作临时列表。这里和一开始的`let nextListeners = currentListeners`是有区别的，通过slice创建了一个新的数组，而之前则是复制了引用。

当然了，有人会想这不是多此一举吗？为什么还要复制一份监听器数组。这是因为当你dispatch后，想要在某个listener回调函数中做完一些操作，然后去取消订阅的时候，如果还是同一个数组，势必会影响本次dispatch的监听，我们期望的是在下一次dispatch时不要这个监听回调。如果还不理解，等看到什么时候会用到这个listener数组的时候就能明白了。

```js
function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = currentListeners.slice()
    }
}
```

subscribe在执行过后会返回一个取消订阅的函数，找出当前listener在nextListener数组中的索引，可能会有疑问了，返回的unsubscribe在调用的时候是如何知道我们要取消哪个listener的呢？这里有个小技巧，运用到了闭包的原理，返回的unsubscribe还依赖了原先在subscribe传入的listener变量，所以GC机制并不会去回收这个变量的内存空间。最后通过splice方法删除指定index位置的那一项。isSubscribed控制了只能取消订阅一次，第二次调用unsubscribe的时候，isSubscribed的值就已经是false了，终止了函数的执行。
```js
function subscribe(listener: () => void) {
    // 判断listener是否是一个函数
    // 不能在reducer执行的时候调用suscribe，因为状态树正在发生变化，这点后面会在reducer的分析中细讲
    if (isDispatching) {}
    let isSubscribed = true
    ensureCanMutateNextListeners()
    nextListeners.push(listener)

    return function unsubscribe() {
      if (!isSubscribed) {
        return
      }
      // 同理，在reducer执行的时候也不能取消订阅
      if (isDispatching) {}
      isSubscribed = false
      ensureCanMutateNextListeners()
      const index = nextListeners.indexOf(listener)
      nextListeners.splice(index, 1)
      currentListeners = null
    }
}
```
getState则是获取当前的状态，同理，也不能在dispatch的时候执行，需要等待状态稳定的时候才可以。

下面来看dispatch：
1. 判断接受的action是否为普通对象，如果不是，则不支持，需要去使用类似redux-thunk这样的中间件。
2. action对象中的type参数是必传的。
3. 如果正处于dispatch的状态，则不能调用。
4. 通过当前的reducer函数处理，当前状态树发生变更。
5. 如果状态树发生改变，那就证明可以安全的调用监听器数组里的函数了，所以需要将nextListeners赋值给currentListeners，并执行其中所有的listener函数。
6. 函数最后会返回当前的action。

```js
function dispatch(action: A) {
    if (!isPlainObject(action)) {}
    if (typeof action.type === 'undefined') {}
    if (isDispatching) {}

    try {
      isDispatching = true
      currentState = currentReducer(currentState, action)
    } finally {
      isDispatching = false
    }

    const listeners = (currentListeners = nextListeners)
    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i]
      listener()
    }
    return action
  }
```
### replaceReducer
这个函数源码就不贴了，本质上是将nextReducer替换currentReducer，`replaceReducer`顾名思义就是用来替换当前的reducer函数，在替换完成之后，会执行 `dispatch({ type: ActionTypes.INIT })` ，用于初始化store的状态，这里就用到了一开始在actionTypes文件中定义的变量了，保证重新初始化的store是不与之前重复的。咋一看，这个为什么要去替换他，我在什么场景下会使用到这个API，如果详细的看注释了，就可以知道，在如下情况中，可能使用到`replaceReducer`：
1. 当你的应用程序用到code spliting(代码分割)的时候
2. 动态的加载不同的reducer的时候
3. 需要为redux实现一个热重载机制的时候
## combineReducers
官方文档中说了一句`combineReducers` 辅助函数的作用是，把一个由多个不同 reducer 函数作为 value 的 object，合并成一个最终的 reducer 函数，然后就可以对这个 reducer 调用 [`createStore`](http://cn.redux.js.org/api/createstore) 方法。我们实际上也是这么用的，那么redux是怎么实现这一个功能的呢？下面就来一起看看吧。

将一些判断去除，精简过后其实就只是将每个传入的reducer重新组装成一个大对象finalReducers。
```js
const reducerKeys = Object.keys(reducers)
const finalReducers: ReducersMapObject = {}
for (let i = 0; i < reducerKeys.length; i++) {
    const key = reducerKeys[i]
    finalReducers[key] = reducers[key]
}
```
在合成了这个finalReducers对象之后，我们看到一个assertReducerShape函数，这个函数是用于校验每个reducer函数执行的结果是不是都有一个保底的值，如果action.type不存在，你必须明确的返回一个initial state，而不是undefined。这里就用到了`const initialState = reducer(undefined, { type: ActionTypes.INIT })`和`typeof reducer(undefined, { type: ActionTypes.PROBE_UNKNOWN_ACTION() }) === 'undefined'`进行校验。


但我们可以从createStore中看到，第二个参数是一个reducer函数，我们不可能将这个大对象给返回出去，应该将这个对象重新组装成一个最终的reducer函数，函数执行的返回结果是这个finalReducers。
```js
function combination(
    state: StateFromReducersMapObject<typeof reducers> = {},
    action: AnyAction
  ) {
    let hasChanged = false
    const nextState: StateFromReducersMapObject<typeof reducers> = {}
    for (let i = 0; i < finalReducerKeys.length; i++) {
      // 获取finalReducerKeys的key和value（reducer）
      const key = finalReducerKeys[i]
      const reducer = finalReducers[key]
      // 获取到当前key值对应的初始state
      const previousStateForKey = state[key]
      // 执行reducer函数，如果当前的action在reducer中，则会改变当前的state
      const nextStateForKey = reducer(previousStateForKey, action)
      nextState[key] = nextStateForKey
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey
    }
    hasChanged =
      hasChanged || finalReducerKeys.length !== Object.keys(state).length
    return hasChanged ? nextState : state
  }
}
```
## applyMiddleware
applyMiddleware每个 middleware 接受Store的dispatch和getState函数作为命名参数，并返回一个函数enhander，再通过compose函数把每个middleware串起来。

applyMiddleware函数可以接收多个middleware，我们可以先来看看官网的logger middleware，我们模仿着写两个logger2、logger3。把console.log改一下，分别打印dispatch 1、2、3，`const store = Redux.createStore(reducer, applyMiddleware(logger1, logger2,  logger3))`，可以看到会依次打印will dispatch 1、2、3，state after dispatch3、2、1。事实上，这里写的next就是下一个middleware函数，这就是所谓的洋葱模型。
```js
function logger({ getState }) {
return next => action => {
    console.log('will dispatch 1', action)
    // 调用 middleware 链中下一个 middleware 的 dispatch。
    const returnValue = next(action)
    console.log('state after dispatch', getState())
    // 一般会是 action 本身，除非
    // 后面的 middleware 修改了它。
    return returnValue
    }
}
```
```js
export default function applyMiddleware(...middlewares) {
  return createStore => (...args) => {
    const store = createStore(...args)
    let dispatch = () => {
      throw new Error(
        'Dispatching while constructing your middleware is not allowed. ' +
          'Other middleware would not be applied to this dispatch.'
      )
    }

    const middlewareAPI = {
      getState: store.getState,
      dispatch: (...args) => dispatch(...args)
    }
    const chain = middlewares.map(middleware => middleware(middlewareAPI))
    dispatch = compose(...chain)(store.dispatch)

    return {
      ...store,
      dispatch
    }
  }
}
```
而compose函数又是做什么的呢？他其实是将传入一组函数，通过从右到左组合参数函数而获得的函数，第一个函数的返回值作为第二个函数的参数，从而实现一个链式的增强效果。
```js
export default function compose(...funcs) {
  if (funcs.length === 0) {
    return arg => arg
  }

  if (funcs.length === 1) {
    return funcs[0]
  }

  return funcs.reduce((a, b) => (...args) => a(b(...args)))
}
```
## 参考资料
- https://zhuanlan.zhihu.com/p/205359984
- https://stackoverflow.com/questions/69399211/typescript-why-does-as-unknown-as-x-work
- https://www.cnblogs.com/fsjohnhuang/p/4146506.html
