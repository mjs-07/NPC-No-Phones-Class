export const STORY_BEATS = [
  {
    at: 0,
    label: 'The quiet',
    eyebrow: '01 / THE QUIET',
    title: 'Every class',
    accent: 'deserves attention.',
    body: 'A little time to settle in. A chance to be here, together.',
  },
  {
    at: 0.2,
    label: 'The interruption',
    eyebrow: '02 / THE INTERRUPTION',
    title: 'One notification.',
    accent: 'And attention slips.',
    body: 'The screen lights up. It only takes a moment for the room to look away.',
  },
  {
    at: 0.4,
    label: 'The intervention',
    eyebrow: '03 / THE INTERVENTION',
    title: 'Start class.',
    accent: 'Know who’s here.',
    body: 'Start a session, let students scan the QR, and see check-ins as they arrive.',
  },
  {
    at: 0.6,
    label: 'The return',
    eyebrow: '04 / THE RETURN',
    title: 'Phones away.',
    accent: 'Back to the lesson.',
    body: 'Once students have checked in, the phones can rest and the lesson can begin.',
  },
  {
    at: 0.8,
    label: 'After the bell',
    eyebrow: '05 / AFTER THE BELL',
    title: 'The lesson ends.',
    accent: 'The record stays.',
    body: 'Login and logout times stay with the session, ready for an attendance export.',
  },
]

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value))

const ease = (value) => {
  value = clamp(value)
  return value * value * (3 - 2 * value)
}

const lerp = (start, end, amount) => start + (end - start) * amount

function samplePath(keys, progress, output) {
  if (!keys?.length || !output) return

  if (keys.length === 1) {
    output.copy(keys[0].value)
    return
  }

  let index = 0

  while (index < keys.length - 2 && progress > keys[index + 1].at) {
    index++
  }

  const a = keys[index]
  const b = keys[index + 1]
  const t = ease((progress - a.at) / Math.max(b.at - a.at, 0.0001))

  output.copy(a.value).lerp(b.value, t)
}

export function updateClassroomTimeline(
  sceneParts,
  progress,
  camera,
  lookTarget,
  elapsed = 0,
  delta = 0,
  reducedMotion = false
) {
  const p = clamp(progress)

  if (!sceneParts || !camera || !lookTarget) return

  const {
    phone,
    phoneScreen,
    phoneAlert,
    notebook,
    qr,
    chalkboardGlow,
    sunLight,
    coolFill,
    dust,
    cameraPath,
    screenGlow,
    scene,
    fog,
    warmTone,
    coolTone,
    warmSunTone,
    coolSunTone,
  } = sceneParts

  if (cameraPath?.positions) samplePath(cameraPath.positions, p, camera.position)
  if (cameraPath?.targets) samplePath(cameraPath.targets, p, lookTarget)

  camera.lookAt(lookTarget)

  const notification =
    ease((p - 0.105) / 0.035) *
    (1 - ease((p - 0.18) / 0.1))
  const checkIn =
    ease((p - 0.37) / 0.075) *
    (1 - ease((p - 0.53) / 0.09))
  const phoneAside = ease((p - 0.61) / 0.055)
  const notebookReveal = ease((p - 0.67) / 0.06)
  const notebookOpen = ease((p - 0.735) / 0.06)
  const ending = ease((p - 0.8) / 0.2)
  const vibration = reducedMotion
    ? 0
    : Math.sin(elapsed * 31) * notification

  if (phone) {
    phone.position.set(lerp(0, 0.95, phoneAside), 1.22 + vibration * 0.012, 2.7)
    phone.rotation.z = lerp(-0.12, -0.05, phoneAside) +
      vibration * 0.012
    phone.rotation.x = -Math.PI / 2
  }

  if (phoneScreen) {
    phoneScreen.material.emissiveIntensity =
      0.035 + notification * 1.45 + checkIn * 0.55 - phoneAside * 0.025
  }

  if (phoneAlert) {
    phoneAlert.visible = notification > 0.035
    phoneAlert.scale.setScalar(0.9 + notification * 0.1)
    phoneAlert.traverse((object) => {
      if (object.material?.transparent) object.material.opacity = notification
    })
  }

  if (qr) {
    qr.visible = false
    qr.material.opacity = 0
  }

  if (screenGlow?.material) {
    screenGlow.material.opacity = 0.1 + checkIn * 0.62 - phoneAside * 0.08
  }

  if (notebook) {
    notebook.position.set(
      lerp(-1.4, 0, notebookReveal),
      1.22,
      lerp(3.1, 2.7, notebookReveal)
    )
    notebook.rotation.y = lerp(-0.12, 0, notebookReveal)
    if (notebook.userData.coverHinge) {
      notebook.userData.coverHinge.rotation.z = notebookOpen * Math.PI
    }
  }

  if (sunLight) {
    sunLight.intensity = 3.4 + ending * 0.5 - notification * 0.3
    if (warmSunTone && coolSunTone) {
      sunLight.color.copy(warmSunTone).lerp(coolSunTone, notification * 0.28)
    }
  }

  if (coolFill) {
    coolFill.intensity = 0.55 + notification * 0.5 - ending * 0.2
  }

  if (scene?.background && warmTone && coolTone) {
    scene.background.copy(warmTone).lerp(coolTone, notification * 0.2)
  }

  if (fog?.color && warmTone && coolTone) {
    fog.color.copy(warmTone).lerp(coolTone, notification * 0.2)
  }

  if (dust) {
    dust.material.opacity = 0.045 + ending * 0.075
    dust.position.x = Math.sin(elapsed * 0.18) * 0.28
    dust.position.y = Math.sin(elapsed * 0.12) * 0.08

    const positions = dust.geometry.attributes.position
    const basePositions = dust.userData.basePositions

    if (positions && basePositions && !reducedMotion && delta > 0) {
      const values = positions.array

      for (let i = 0; i < values.length; i += 3) {
        const phase = i * 0.013
        values[i] = basePositions[i] + Math.sin(elapsed * 0.24 + phase) * 0.035
        values[i + 1] = basePositions[i + 1] +
          Math.sin(elapsed * 0.32 + phase) * 0.055
        values[i + 2] = basePositions[i + 2]
      }

      positions.needsUpdate = true
    }
  }

  if (chalkboardGlow?.material) {
    chalkboardGlow.material.opacity = 0.05 + ending * 0.14
  }
}
