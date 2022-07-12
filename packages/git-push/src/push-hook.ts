import { bindExec } from '@saus/deploy-utils'
import path from 'path'
import { relativeToCwd } from 'saus/core'
import { defineDeployHook } from 'saus/deploy'
import { PushConfig } from './config'
import { stashedRoots } from './stash'

export default defineDeployHook(ctx => {
  return {
    name: '@saus/git-push',
    ephemeral: ['commit'],
    async pull(config: PushConfig) {
      const cwd = path.resolve(ctx.root, config.root)
      const git = bindExec('git', { cwd })

      const { commit } = config
      if (commit === false) {
        ctx.logPlan(`skip commit in ${relativeToCwd(cwd)}/`)
      } else if (await git('status --porcelain')) {
        await ctx.logPlan(
          `commit changes in ${relativeToCwd(cwd)}/`,
          async () => {
            const message = commit?.message || ctx.lastCommitHeader
            await git('add -A')
            await git('commit -m', [message], {
              noThrow: true,
            })
          }
        )
      }

      return {
        head: await git('rev-parse HEAD'),
      }
    },
    identify: ({ root }) => ({
      root,
    }),
    async spawn(config) {
      const cwd = path.resolve(ctx.root, config.root)
      const git = bindExec('git', { cwd })

      ctx.logActivity(`pushing ${relativeToCwd(cwd)}/`)
      await git('push')

      if (stashedRoots.has(cwd)) {
        await git('stash pop')
        stashedRoots.delete(cwd)
      }

      return async () => {
        await git('reset --hard HEAD^')
      }
    },
    update(config, _, onRevert) {
      return this.spawn(config, onRevert)
    },
    kill: config => {
      // TODO: support kill action
    },
  }
})
