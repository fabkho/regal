import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector2 } from 'three'
import { clickAt, SHELVED } from '../../app/utils/books/pick'
import { CLICK_SLOP, isClick, movePress, startPress } from '../../app/utils/books/press'
import { bookAt, toNdc } from '../../app/utils/books/hit'

const at = (clientX: number, clientY: number, pointerId = 1) => ({ pointerId, clientX, clientY })

describe('telling a click from a drag', () => {
  it('counts a press that stays put as a click, however long it is held', () => {
    expect(isClick(startPress(at(100, 100)), at(100, 100))).toBe(true)
  })

  it('forgives a few pixels of jitter (a trackpad press wobbles)', () => {
    let press = startPress(at(100, 100))
    press = movePress(press, at(102, 101))
    press = movePress(press, at(101, 100))
    expect(isClick(press, at(101, 100))).toBe(true)
  })

  it('treats travel beyond the slop as a drag, even when it comes back', () => {
    let press = startPress(at(100, 100))
    press = movePress(press, at(100 + CLICK_SLOP + 20, 100))
    press = movePress(press, at(100, 100))
    expect(isClick(press, at(100, 100))).toBe(false)
    expect(isClick(startPress(at(100, 100)), at(100, 100 + CLICK_SLOP + 1))).toBe(false)
  })

  it('needs a press, by the same pointer', () => {
    expect(isClick(null, at(100, 100))).toBe(false)
    expect(isClick(startPress(at(100, 100, 1)), at(100, 100, 2))).toBe(false)
    // Another pointer moving doesn't spoil the press.
    expect(isClick(movePress(startPress(at(100, 100, 1)), at(300, 300, 2)), at(100, 100, 1))).toBe(true)
  })
})

describe('a click in the 3D', () => {
  it('picks, flips and puts away a Book like clickBook', () => {
    const front = clickAt(SHELVED, 'a')
    expect(front).toEqual({ bookId: 'a', face: 'front' })
    const back = clickAt(front, 'a')
    expect(back).toEqual({ bookId: 'a', face: 'back' })
    expect(clickAt(back, 'a')).toEqual(SHELVED)
  })

  it('puts the picked Book back on empty space, and does nothing without one', () => {
    expect(clickAt({ bookId: 'a', face: 'back' }, null)).toEqual(SHELVED)
    expect(clickAt(SHELVED, null)).toEqual(SHELVED)
  })

  it('on another Book swaps or only puts back, as chosen', () => {
    const out = { bookId: 'a', face: 'back' } as const
    expect(clickAt(out, 'b', 'swap')).toEqual({ bookId: 'b', face: 'front' })
    expect(clickAt(out, 'b', 'put-back')).toEqual(SHELVED)
    // Nothing out: a click takes the Book out either way.
    expect(clickAt(SHELVED, 'b', 'put-back')).toEqual({ bookId: 'b', face: 'front' })
  })
})

describe('what a click hits', () => {
  function scene() {
    const camera = new PerspectiveCamera(40, 1, 0.1, 10)
    camera.position.set(0, 0, 2)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const root = new Group()
    const book = (id: string | null, z: number, x = 0) => {
      const mesh = new Mesh(new BoxGeometry(0.2, 0.3, 0.05))
      mesh.position.set(x, 0, z)
      if (id) mesh.userData.bookId = id
      return mesh
    }
    const inner = new Group()
    inner.add(book('behind', -0.5), book('front', 0))
    // A piece of furniture between the camera and the Books.
    root.add(inner, book(null, 0.5), book('aside', 0, 0.7))
    root.updateMatrixWorld(true)
    return { camera, root }
  }

  it('is the Book nearest the camera, through nested groups and past furniture', () => {
    const { camera, root } = scene()
    expect(bookAt(root, camera, new Vector2(0, 0))).toBe('front')
  })

  it('skips hidden Books and anything that is not a Book', () => {
    const { camera, root } = scene()
    root.traverse((object) => {
      if (object.userData.bookId === 'front') object.visible = false
    })
    expect(bookAt(root, camera, new Vector2(0, 0))).toBe('behind')
  })

  it('is nothing on empty space or without a scene', () => {
    const { camera, root } = scene()
    expect(bookAt(root, camera, new Vector2(-0.9, 0.9))).toBeNull()
    expect(bookAt(null, camera, new Vector2(0, 0))).toBeNull()
  })

  it('maps client pixels to device coordinates of the canvas, null outside', () => {
    const element = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }) } as Element
    const centre = toNdc(element, 200, 100)!
    expect([centre.x, centre.y]).toEqual([0, 0])
    const corner = toNdc(element, 100, 50)!
    expect([corner.x, corner.y]).toEqual([-1, 1])
    expect(toNdc(element, 99, 50)).toBeNull()
  })
})
