import chalk from 'chalk'
import { GraphQLConfig, GraphQLProjectConfig } from 'graphql-config'
import { merge } from 'lodash'
import { Arguments } from 'yargs'
import { spawnSync } from 'npm-run'
// import * as generatorModule from 'graphql-codegen-binding'

export type CodegenConfigs = CodegenConfig[] | CodegenConfig

export interface CodegenConfig {
  input: CodegenInput
  output: CodegenOutput
  language: string
  generator: string
}

export type CodegenInput = CodegenInputObject | string

export interface CodegenInputObject {
  schema: string
  typeDefs: string
}

export interface CodegenOutput {
  binding: string
  typeDefs: string
}

export class Codegen {
  private config: GraphQLConfig
  private projectName: string
  private project: GraphQLProjectConfig

  constructor(private context: any, private argv: Arguments) {}

  public async handle() {
    this.config = await this.context.getConfig()

    // Get projects
    const projects: {
      [name: string]: GraphQLProjectConfig
    } = this.getProjectConfig()

    // if a project has been specified, only process that one project
    if (this.argv.project) {
      if (
        Object.keys(projects).find(project => project === this.argv.project)
      ) {
        const project: GraphQLProjectConfig = projects[this.argv.project]

        this.setCurrentProject(project, this.argv.project)

        this.codegen()
      }
    } else {
      // otherwise process all project provided in the graphql config
      for (const projectName of Object.keys(projects)) {
        const project: GraphQLProjectConfig = projects[projectName]

        this.setCurrentProject(project, projectName)

        this.codegen()
      }
    }
  }

  private setCurrentProject(
    project: GraphQLProjectConfig,
    projectName: string,
  ): void {
    this.project = project
    this.projectName = projectName
  }

  private codegen() {
    if (
      this.project.config.extensions &&
      this.project.config.extensions.codegen
    ) {
      this.context.spinner.start(
        `Generating bindings for project ${this.projectDisplayName()}...`,
      )

      const codegenConfigs: CodegenConfig[] = Array.isArray(
        this.project.config.extensions.codegen,
      )
        ? this.project.config.extensions.codegen
        : [this.project.config.extensions.codegen]

      codegenConfigs.forEach(codegenConfig => {
        const { output, input, generator, language } = codegenConfig
        const inputSchemaPath =
          this.getInputSchemaPath(input) || this.project.schemaPath

        if (!inputSchemaPath) {
          throw new Error(
            `Please either provide a 'schemaPath' or 'input' for the codegen extension in your .graphqlconfig`,
          )
        }

        if (!output) {
          throw new Error(
            `Please specify the 'output' of the codegen extension in your .graphqlconfig`,
          )
        }

        if (!generator) {
          throw new Error(
            `Please specify the 'generator' of codegen extension in your .graphqlconfig`,
          )
        }

        if (!language) {
          throw new Error(
            `Please specify the 'language' of the codegen extension in your .graphqlconfig`,
          )
        }

        const args = ['--input', inputSchemaPath, '--generator', language]
        if (output.binding) {
          args.push('--outputBinding', output.binding)
        }
        if (output.typeDefs) {
          args.push('--outputTypedefs', output.typeDefs)
        }
        const child = spawnSync(generator, args)
        const stderr = child.stderr && child.stderr.toString()
        if (stderr && stderr.length > 0) {
          console.error(child.stderr.toString())
        }

        this.context.spinner.succeed(
          `Code for project ${this.projectDisplayName()} generated to ${chalk.green(
            output.binding,
          )}`,
        )
      })
    } else if (this.argv.verbose) {
      this.context.spinner.info(
        `Codegen not configured for project ${this.projectDisplayName()}. Skipping`,
      )
    }
  }

  private getInputSchemaPath(input?: CodegenInput) {
    if (!input) {
      return null
    }

    if (typeof input === 'string') {
      return input
    }

    return input.schema
  }

  private getProjectConfig(): { [name: string]: GraphQLProjectConfig } {
    let projects: { [name: string]: GraphQLProjectConfig } | undefined
    if (this.argv.project) {
      if (Array.isArray(this.argv.project)) {
        projects = {}
        this.argv.project.map((p: string) =>
          merge(projects, { [p]: this.config.getProjectConfig(p) }),
        )
      } else {
        // Single project mode
        projects = {
          [this.argv.project]: this.config.getProjectConfig(this.argv.project),
        }
      }
    } else {
      // Process all projects
      projects = this.config.getProjects()
    }

    if (!projects) {
      throw new Error('No projects defined in config file')
    }

    return projects
  }

  private projectDisplayName = () => chalk.green(this.projectName)
}
