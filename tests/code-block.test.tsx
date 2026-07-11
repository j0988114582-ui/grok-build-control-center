// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeBlock } from '../src/renderer/src/components/CodeBlock'

describe('CodeBlock', () => {
  afterEach(cleanup)

  it('highlights a known language and copies the original code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<CodeBlock className="language-typescript">{'const answer: number = 42\n'}</CodeBlock>)

    expect(screen.getByTestId('highlighted-code')).toHaveAttribute('data-language', 'typescript')
    await user.click(screen.getByRole('button', { name: '複製程式碼' }))

    expect(writeText).toHaveBeenCalledWith('const answer: number = 42\n')
    expect(screen.getByRole('button', { name: '已複製' })).toBeInTheDocument()
  })
})
