import * as FetchHttpClient from '@effect/platform/FetchHttpClient'
import * as Headers from '@effect/platform/Headers'
import { describe, expect, it } from '@effect/vitest'
import { GetRandomValues, isUuid4, makeUuid4 } from '@typed/id'
import * as LazyRef from '@typed/lazy-ref'
import { Cause, Effect, Exit, Stream } from 'effect'
import * as Option from 'effect/Option'
import * as happyDOM from 'happy-dom'
import { deepStrictEqual, ok } from 'node:assert'
import * as Navigation from './index.js'
import type { PatchedState } from './internal/shared.js'

const equalDestination = (a: Navigation.Destination, b: Navigation.Destination) => {
  const { id: _aId, ...aRest } = a
  const { id: _bId, ...bRest } = b
  deepStrictEqual(aRest, bRest)
}

const equalDestinations = (
  a: ReadonlyArray<Navigation.Destination>,
  b: ReadonlyArray<Navigation.Destination>,
) => {
  const as = a.map(({ id: _, ...rest }) => rest)
  const bs = b.map(({ id: _, ...rest }) => rest)

  return deepStrictEqual(as, bs)
}

const makePatchedState = (state: unknown): PatchedState => {
  return {
    __typed__navigation__id__: makeUuid4.pipe(
      Effect.provide(GetRandomValues.CryptoRandom),
      Effect.runSync,
    ),
    __typed__navigation__key__: makeUuid4.pipe(
      Effect.provide(GetRandomValues.CryptoRandom),
      Effect.runSync,
    ),
    __typed__navigation__state__: state,
  }
}

describe(__filename, () => {
  describe('Navigation', () => {
    it.effect('memory', () => {
      const url = new URL('https://example.com/foo/1')
      const state = { x: Math.random() }
      return Effect.gen(function* () {
        const initial = yield* Navigation.CurrentEntry

        expect(isUuid4(initial.id)).toEqual(true)
        expect(isUuid4(initial.key)).toEqual(true)
        expect(initial.url).toEqual(url)
        expect(initial.state).toEqual(state)
        expect(initial.sameDocument).toEqual(true)
        expect(yield* Navigation.Entries).toEqual([initial])

        const count = yield* LazyRef.of(0)

        yield* Navigation.beforeNavigation(() =>
          Effect.succeedSome(LazyRef.update(count, (x) => x + 10)),
        )
        yield* Navigation.onNavigation(() =>
          Effect.succeedSome(LazyRef.update(count, (x) => x * 2)),
        )

        const second = yield* Navigation.navigate('/foo/2')

        expect(second.url).toEqual(new URL('/foo/2', url.origin))
        expect(second.state).toEqual(undefined)
        expect(second.sameDocument).toEqual(true)
        equalDestinations(yield* Navigation.Entries, [initial, second])

        expect(yield* count).toEqual(20)

        equalDestination(yield* Navigation.back(), initial)
        equalDestination(yield* Navigation.forward(), second)

        expect(yield* count).toEqual(140)

        const third = yield* Navigation.navigate('/foo/3')

        expect(third.url).toEqual(new URL('/foo/3', url.origin))
        expect(third.state).toEqual(undefined)
        expect(third.sameDocument).toEqual(true)
        equalDestinations(yield* Navigation.Entries, [initial, second, third])

        expect(yield* count).toEqual(300)

        equalDestination(yield* Navigation.traverseTo(initial.key), initial)
        equalDestination(yield* Navigation.forward(), second)

        expect(yield* count).toEqual(1260)

        // Test that the maxEntries option is respected

        const fourth = yield* Navigation.navigate(new URL('/foo/4', url.origin))
        const fifth = yield* Navigation.navigate(new URL('/foo/5', url.origin))
        const sixth = yield* Navigation.navigate(new URL('/foo/6', url.origin))

        expect(yield* Navigation.Entries).toEqual([fourth, fifth, sixth])
      }).pipe(
        Effect.provide(Navigation.initialMemory({ url, state, maxEntries: 3 })),
        Effect.provide(GetRandomValues.CryptoRandom),
        Effect.scoped,
      )
    })

    describe('window', () => {
      const url = new URL('https://example.com/foo/1')
      const state = makePatchedState({
        x: Math.random(),
      })

      it('manages navigation', async () => {
        const window = makeWindow({ url: url.href }, state)
        const test = Effect.gen(function* (_) {
          const initial = yield* Navigation.CurrentEntry

          expect(isUuid4(initial.id)).toEqual(true)
          expect(isUuid4(initial.key)).toEqual(true)
          expect(initial.url).toEqual(url)
          expect(initial.state).toEqual(state.__typed__navigation__state__)
          expect(initial.sameDocument).toEqual(true)
          expect(yield* Navigation.Entries).toEqual([initial])

          const count = yield* LazyRef.of(0)

          yield* Navigation.beforeNavigation(() =>
            Effect.succeedSome(LazyRef.update(count, (x) => x + 10)),
          )
          yield* Navigation.onNavigation(() =>
            Effect.succeedSome(LazyRef.update(count, (x) => x * 2)),
          )

          const second = yield* Navigation.navigate('/foo/2')

          expect(second.url).toEqual(new URL('/foo/2', url.origin))
          expect(second.state).toEqual(undefined)
          expect(second.sameDocument).toEqual(true)
          equalDestinations(yield* Navigation.Entries, [initial, second])

          expect(yield* count).toEqual(20)

          equalDestination(yield* Navigation.back(), initial)
          equalDestination(yield* Navigation.forward(), second)

          expect(yield* count).toEqual(140)

          const third = yield* Navigation.navigate('/foo/3')

          expect(third.url).toEqual(new URL('/foo/3', url.origin))
          expect(third.state).toEqual(undefined)
          expect(third.sameDocument).toEqual(true)
          equalDestinations(yield* Navigation.Entries, [initial, second, third])

          expect(yield* count).toEqual(300)

          equalDestination(yield* Navigation.traverseTo(initial.key), initial)
          equalDestination(yield* Navigation.forward(), second)

          expect(yield* count).toEqual(1260)
        }).pipe(
          Effect.provide(Navigation.fromWindow(window)),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })

      it('manages state with History API', async () => {
        const window = makeWindow({ url: url.href }, state)
        const test = Effect.gen(function* (_) {
          const current = yield* Navigation.CurrentEntry

          // Initializes from History state when possible
          deepStrictEqual(current.id, state.__typed__navigation__id__)
          deepStrictEqual(current.key, state.__typed__navigation__key__)
          deepStrictEqual(current.state, state.__typed__navigation__state__)
          deepStrictEqual(window.history.state, state.__typed__navigation__state__)

          const next = yield* Navigation.navigate('/foo/2')

          deepStrictEqual(next.state, undefined)
          deepStrictEqual(window.history.state, undefined)
        }).pipe(
          Effect.provide(Navigation.fromWindow(window)),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })

      it('responds to popstate events', async () => {
        const window = makeWindow({ url: url.href }, state)
        const test = Effect.gen(function* (_) {
          const { history, location } = window

          const current = yield* Navigation.CurrentEntry

          // Initializes from History state when possible
          deepStrictEqual(current.id, state.__typed__navigation__id__)
          deepStrictEqual(current.key, state.__typed__navigation__key__)
          deepStrictEqual(current.state, state.__typed__navigation__state__)

          const next = yield* Navigation.navigate('/foo/2')

          deepStrictEqual(next.state, undefined)
          deepStrictEqual(history.state, undefined)

          // Manually change the URL
          location.href = url.href

          history.back()
          const ev = new window.PopStateEvent('popstate', {
            state,
          })
          Object.assign(ev, { state })
          window.dispatchEvent(ev)
          const popstate = yield* Navigation.CurrentEntry

          deepStrictEqual(popstate.id, state.__typed__navigation__id__)
          deepStrictEqual(popstate.key, state.__typed__navigation__key__)
          deepStrictEqual(popstate.state, state.__typed__navigation__state__)
          deepStrictEqual(history.state, state.__typed__navigation__state__)
        }).pipe(
          Effect.provide(Navigation.fromWindow(window)),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        const exit = await Effect.runPromiseExit(test)

        if (Exit.isFailure(exit)) {
          console.error(Cause.pretty(exit.cause))
          throw exit.cause
        }
      })

      it('responds to hashchange events', async () => {
        const window = makeWindow({ url: url.href }, state)
        const test = Effect.gen(function* (_) {
          const { history, location } = window
          const current = yield* Navigation.CurrentEntry

          // Initializes from History state when possible
          deepStrictEqual(current.key, state.__typed__navigation__key__)
          deepStrictEqual(current.url.hash, '')

          deepStrictEqual(current.state, state.__typed__navigation__state__)
          deepStrictEqual(history.state, state.__typed__navigation__state__)

          const hashChangeEvent = new window.HashChangeEvent('hashchange')

          // We need to force hasChangeEvent to have these proeprties
          Object.assign(hashChangeEvent, {
            oldURL: location.href,
            newURL: `${location.href}#baz`,
          })

          window.dispatchEvent(hashChangeEvent)

          yield* Effect.sleep(1)

          const hashChange = yield* Navigation.CurrentEntry

          deepStrictEqual(hashChange.key, state.__typed__navigation__key__)
          deepStrictEqual(hashChange.url.hash, '#baz')
          deepStrictEqual(hashChange.state, state.__typed__navigation__state__)
          // deepStrictEqual(history.state, {
          //   ...initialState,
          //   id: hashChange.id,
          // });
        }).pipe(
          Effect.provide(Navigation.fromWindow(window)),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })
    })

    describe('beforeNavigation', () => {
      const url = new URL('https://example.com/foo/1')
      const state = { initial: Math.random() }
      const redirectUrl = new URL('https://example.com/bar/42')
      const redirect = Navigation.redirectToPath(redirectUrl)

      it('allows performing redirects', async () => {
        const test = Effect.gen(function* (_) {
          const initial = yield* Navigation.CurrentEntry

          deepStrictEqual(initial.url, url)

          yield* Navigation.beforeNavigation((handler) =>
            Effect.gen(function* (_) {
              const current = yield* Navigation.CurrentEntry

              // Runs before the URL has been committed
              deepStrictEqual(current.url, handler.from.url)

              return yield* handler.to.url === url ? Effect.fail(redirect) : Effect.succeedNone
            }),
          )

          yield* Navigation.navigate(url)

          const next = yield* Navigation.CurrentEntry

          deepStrictEqual(next.url, redirectUrl)

          // Redirects replace the current entry
          deepStrictEqual(yield* Navigation.Entries, [next])
        }).pipe(
          Effect.provide(Navigation.initialMemory({ url, state })),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })

      it('allows canceling navigation', async () => {
        const test = Effect.gen(function* (_) {
          const initial = yield* Navigation.CurrentEntry

          deepStrictEqual(initial.url, url)

          yield* Navigation.beforeNavigation((handler) =>
            Effect.gen(function* (_) {
              const current = yield* Navigation.CurrentEntry

              // Runs before the URL has been committed
              deepStrictEqual(current.url, handler.from.url)

              return yield* handler.to.url === redirectUrl
                ? Navigation.cancelNavigation
                : Effect.succeedNone
            }),
          )

          yield* Navigation.navigate(redirectUrl)

          const next = yield* Navigation.CurrentEntry

          deepStrictEqual(next.url, url)

          deepStrictEqual(yield* Navigation.Entries, [initial])
        }).pipe(
          Effect.provide(Navigation.initialMemory({ url, state })),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })
    })

    describe('onNavigation', () => {
      const url = new URL('https://example.com/foo/1')
      const redirectUrl = new URL('https://example.com/bar/42')
      const redirect = Navigation.redirectToPath(redirectUrl)
      const intermmediateUrl = new URL('https://example.com/foo/2')

      it('runs only after the url has been committed', async () => {
        const test = Effect.gen(function* (_) {
          const navigation = yield* Navigation.Navigation

          let beforeCount = 0
          let afterCount = 0

          yield* navigation.beforeNavigation((event) =>
            Effect.gen(function* (_) {
              beforeCount++

              if (event.to.url === intermmediateUrl) {
                return yield* Effect.fail(redirect)
              }

              return Option.none()
            }),
          )

          yield* navigation.onNavigation((event) =>
            Effect.sync(() => {
              deepStrictEqual(event.destination.url, redirectUrl)

              afterCount++
              return Option.none()
            }),
          )

          yield* Navigation.navigate(intermmediateUrl)

          // Called once for intermmediateUrl
          // Then again for the redirectUrl
          deepStrictEqual(beforeCount, 2)

          // Only called once with the redirectUrl
          deepStrictEqual(afterCount, 1)
        }).pipe(
          Effect.provide(Navigation.initialMemory({ url })),
          Effect.provide(GetRandomValues.layer((length) => Effect.succeed(new Uint8Array(length)))),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })
    })

    describe('transition', () => {
      const url = new URL('https://example.com/foo/1')
      const nextUrl = new URL('https://example.com/foo/2')

      it('captures any ongoing transitions', async () => {
        const test = Effect.gen(function* () {
          const fiber = yield* Navigation.Transition.pipe(
            Stream.take(2),
            Stream.runCollect,
            Effect.map((_) => Array.from(_)),
            Effect.forkScoped,
          )

          // Allow fiber to start
          yield* Effect.sleep(0)

          yield* Navigation.navigate(nextUrl)

          const events = yield* Effect.fromFiber(fiber)

          deepStrictEqual(events.length, 2)
          deepStrictEqual(events[0], Option.none())
          ok(Option.isSome(events[1]))
          const event = events[1].value
          deepStrictEqual(event.from.url, url)
          deepStrictEqual(event.to.url, nextUrl)
        }).pipe(
          Effect.provide(Navigation.initialMemory({ url })),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )
        await Effect.runPromise(test)
      })
    })

    describe('native navigation', () => {
      const url = new URL('https://example.com/foo/1')
      const state = makePatchedState({ x: Math.random() })
      it('manages navigation', async () => {
        const window = makeWindow({ url: url.href }, state)
        const NavigationPolyfill = await import('@virtualstate/navigation')
        const { navigation } = NavigationPolyfill.getCompletePolyfill({
          window: window as any,
          history: window.history as any,
        })
        ;(window as any).navigation = navigation as any
        const test = Effect.gen(function* (_) {
          const initial = yield* Navigation.CurrentEntry

          expect(isUuid4(initial.id)).toEqual(true)
          expect(isUuid4(initial.key)).toEqual(true)
          expect(initial.url).toEqual(url)
          expect(initial.state).toEqual(state)
          expect(initial.sameDocument).toEqual(true)
          expect(yield* Navigation.Entries).toEqual([initial])

          const count = yield* LazyRef.of(0)

          yield* Navigation.beforeNavigation(() =>
            Effect.succeedSome(LazyRef.update(count, (x) => x + 10)),
          )
          yield* Navigation.onNavigation(() =>
            Effect.succeedSome(LazyRef.update(count, (x) => x * 2)),
          )

          const second = yield* Navigation.navigate('/foo/2')

          expect(second.url).toEqual(new URL('/foo/2', url.origin))
          expect(second.state).toEqual(undefined)
          expect(second.sameDocument).toEqual(true)
          equalDestinations(yield* Navigation.Entries, [initial, second])

          expect(yield* count).toEqual(20)

          equalDestination(yield* Navigation.back(), initial)
          equalDestination(yield* Navigation.forward(), second)

          expect(yield* count).toEqual(140)

          const third = yield* Navigation.navigate('/foo/3')

          expect(third.url).toEqual(new URL('/foo/3', url.origin))
          expect(third.state).toEqual(undefined)
          expect(third.sameDocument).toEqual(true)
          equalDestinations(yield* Navigation.Entries, [initial, second, third])

          expect(yield* count).toEqual(300)

          equalDestination(yield* Navigation.traverseTo(initial.key), initial)
          equalDestination(yield* Navigation.forward(), second)

          expect(yield* count).toEqual(1260)
        }).pipe(
          Effect.provide(Navigation.fromWindow(window)),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.scoped,
        )

        await Effect.runPromise(test)
      })
    })
  })

  describe('useBlockNavigation', () => {
    const url = new URL('https://example.com/foo/1')
    const nextUrl = new URL('https://example.com/bar/42')

    it('allows blocking the current navigation', async () => {
      const test = Effect.gen(function* (_) {
        const blockNavigation = yield* Navigation.useBlockNavigation()
        let didBlock = false

        yield* Effect.forkScoped(
          blockNavigation.whenBlocked((blocking) => {
            didBlock = true
            return blocking.confirm
          }),
        )

        yield* Navigation.navigate(nextUrl)

        deepStrictEqual(didBlock, true)

        deepStrictEqual(yield* Navigation.CurrentPath, '/bar/42')
      }).pipe(
        Effect.provide(Navigation.initialMemory({ url })),
        Effect.provide(GetRandomValues.CryptoRandom),
        Effect.scoped,
      )

      await Effect.runPromise(test)
    })

    it('allows cancelling the current navigation', async () => {
      const test = Effect.gen(function* (_) {
        const blockNavigation = yield* Navigation.useBlockNavigation()
        let didBlock = false

        yield* Effect.forkScoped(
          blockNavigation.whenBlocked((blocking) => {
            didBlock = true
            return blocking.cancel
          }),
        )

        yield* Navigation.navigate(nextUrl)

        deepStrictEqual(didBlock, true)
        deepStrictEqual(yield* Navigation.CurrentPath, '/foo/1')
      }).pipe(
        Effect.provide(Navigation.initialMemory({ url })),
        Effect.provide(GetRandomValues.CryptoRandom),
        Effect.scoped,
      )

      await Effect.runPromise(test)
    })
  })

  describe('submit', () => {
    describe('get', () => {
      const url = new URL('https://example.com/foo/1')
      const nextUrl = new URL('https://example.com/bar/42')

      it.effect('intercepts redirects when submitting a form', () =>
        Effect.gen(function* () {
          const [destination, response] = yield* Navigation.submit({
            method: 'get',
            name: 'foo',
          })

          deepStrictEqual(destination.url, nextUrl)
          deepStrictEqual(response.status, 302)
          deepStrictEqual(Headers.get(response.headers, 'location'), Option.some(nextUrl.href))
        }).pipe(
          Effect.provide([Navigation.initialMemory({ url }), FetchHttpClient.layer]),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.provideService(FetchHttpClient.Fetch, () =>
            Promise.resolve(
              new Response(null, { status: 302, headers: { Location: nextUrl.href } }),
            ),
          ),
          Effect.scoped,
        ),
      )

      it.effect('ignores non-redirects', () =>
        Effect.gen(function* () {
          const [destination, response] = yield* Navigation.submit({
            method: 'get',
            name: 'foo',
          })

          deepStrictEqual(destination.url, url)
          deepStrictEqual(response.status, 400)
        }).pipe(
          Effect.provide([Navigation.initialMemory({ url }), FetchHttpClient.layer]),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.provideService(FetchHttpClient.Fetch, () =>
            Promise.resolve(new Response(null, { status: 400 })),
          ),
          Effect.scoped,
        ),
      )
    })

    describe('post', () => {
      const url = new URL('https://example.com/foo/1')
      const nextUrl = new URL('https://example.com/bar/42')

      it.effect('intercepts redirects when submitting a form', () =>
        Effect.gen(function* () {
          const [destination, response] = yield* Navigation.submit({
            method: 'post',
            name: 'foo',
          })

          deepStrictEqual(destination.url, nextUrl)
          deepStrictEqual(response.status, 302)
          deepStrictEqual(Headers.get(response.headers, 'location'), Option.some(nextUrl.href))
        }).pipe(
          Effect.provide([Navigation.initialMemory({ url }), FetchHttpClient.layer]),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.provideService(FetchHttpClient.Fetch, () =>
            Promise.resolve(
              new Response(null, { status: 302, headers: { Location: nextUrl.href } }),
            ),
          ),
          Effect.scoped,
        ),
      )

      it.effect('ignores non-redirects', () =>
        Effect.gen(function* () {
          const [destination, response] = yield* Navigation.submit({
            method: 'post',
            name: 'foo',
          })

          deepStrictEqual(destination.url, url)
          deepStrictEqual(response.status, 400)
        }).pipe(
          Effect.provide([Navigation.initialMemory({ url }), FetchHttpClient.layer]),
          Effect.provide(GetRandomValues.CryptoRandom),
          Effect.provideService(FetchHttpClient.Fetch, () =>
            Promise.resolve(new Response(null, { status: 400 })),
          ),
          Effect.scoped,
        ),
      )
    })
  })

  describe('base', () => {
    const url = new URL('https://example.com/foo/1')

    it.effect('uses the base when navigating relative urls', () => {
      const test = Effect.gen(function* (_) {
        const destination = yield* Navigation.navigate('/2')
        deepStrictEqual(destination.url, new URL('/foo/2', url.origin))
      })

      return test.pipe(
        Effect.provide(Navigation.initialMemory({ url, base: '/foo' })),
        Effect.provide(GetRandomValues.CryptoRandom),
        Effect.scoped,
      )
    })
  })
})

function makeWindow(
  options?: ConstructorParameters<typeof happyDOM.Window>[0],
  state?: PatchedState,
) {
  const window = new happyDOM.Window(options)

  // If state is provided, replace the current history state
  if (state !== undefined && window.history) {
    window.history.replaceState(state, '', window.location.href)
  }

  return window as any as Window & typeof globalThis & Pick<happyDOM.Window, 'happyDOM'>
}
