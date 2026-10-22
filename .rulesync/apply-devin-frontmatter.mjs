import { glob, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as yaml from 'js-yaml'

function parseSkill(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) {
    throw new Error('Missing skill frontmatter')
  }
  return {
    frontmatter: yaml.load(match[1]),
    body: content.slice(match[0].length),
  }
}

for await (const path of glob('*/SKILL.md', { cwd: '.agents/skills' })) {
  const source = parseSkill(await readFile(join('.rulesync/skills', path), 'utf8'))
  const devin = source.frontmatter.devin
  if (!devin) {
    continue
  }

  const outputPath = join('.agents/skills', path)
  const original = await readFile(outputPath, 'utf8')
  const generated = parseSkill(original)
  const frontmatter = yaml.dump({ ...generated.frontmatter, ...devin }, { lineWidth: 120 })
  const content = `---\n${frontmatter}---\n${generated.body}`
  if (content !== original) {
    await writeFile(outputPath, content)
  }
}
