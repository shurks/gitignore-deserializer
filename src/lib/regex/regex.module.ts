import { UniqueCombinations } from './regex.types'
import { RegexFlags, RegexCaptureOptions, RegexMatchesPerCaptureGroup, RegexBuilderAliasKeywords, RegexBuilderPropertiesNested, PickRegex, RegexBuilderPropertiesNestedAll, RegexHelpers, RegexBuilderPropertiesAfterFlags, RegexBuilderPropertiesNestedAfterQuantifier } from "./regex.types"

/**
* A module for building regexes
* 
* @author Stan Hurks
*/
export class RegexModule<Aliases extends string, OptionalAliases extends string = ''> {  
    /**
     * The children of the regex
     */
    public children: RegexModule<Aliases, OptionalAliases>[] = []

    /**
     * The regex of this instance, will only be set
     * if there is 1 argument provided in the constructor
     * and if that argument is an instance of `RegExp`
     */
    public regex: RegExp | null = null

    /**
     * Regexes used in an or statement for this regex instance.
     */
    public orStatements: RegexModule<Aliases, OptionalAliases>[] = []

    /**
     * Whether or not this regex is optional
     */
    public _optional: boolean = false

    /**
     * Whether or not a plus sign is used
     */
    public plusSign: boolean = false

    /**
     * The suffix
     */
    public _quantifier: string | null = null

    /**
     * Unlimited quantifier (*)
     */
    public quantifierAsterix: boolean = false

    /**
     * All except the regex given
     */
    public allExcept: boolean = false

    /**
     * All aliases for sub-regexes within this regex.
     */
    private aliases: { [name: string]: RegexModule<Aliases, OptionalAliases> } = {}

    /**
     * The specified flags using `this.flags()` or `Regex.flags()`
     */
    private _flags: UniqueCombinations<RegexFlags>|null = null

    /**
     * The parent
     */
    private parent: RegexModule<Aliases, OptionalAliases>|null = null

    constructor(...children: Array<RegExp | RegexModule<Aliases, OptionalAliases> | string>) {
        if (children.length === 1 && children[0] instanceof RegExp) {
            this.regex = children[0]
        }
        else if (children.length) {
            children.forEach((child) => {
                const regex = child instanceof RegExp
                    ? new RegexModule<Aliases, OptionalAliases>(child)
                    : (
                        typeof child === 'string'
                        ? RegexModule.parseVariable(child) as any
                        : child
                    )
                regex.parent = this
                this.children.push(regex)
            })
        }
    }

    /**
     * Combines aliases together in a regex to create an array of captures.
     * 
     * See the static `Regex.capture` method.
     * @see capture
     * 
     * @param string The string to create the captures from
     * @param options The options for creating the captures, can be an alias or an object with additional options and an array of aliases for the groups.
     * @param groups Additional aliases to add as groups to the 
     */
    public capture<Groups extends Aliases> (
        string: string,
        optionsOrAGroup: Groups | Aliases | (Omit<RegexCaptureOptions<Groups | Aliases, '^'|'^$'|'$'|'none'>, 'groups'> & {groups: (Groups | Aliases)[]}),
        ...groups: Array<Groups | Aliases>
    ): Array<RegexMatchesPerCaptureGroup<`${`anything_before_`}${Groups}`|Groups>> {
        const options: (Omit<RegexCaptureOptions<(Groups | Aliases), '^'|'^$'|'$'|'none'>, 'groups'> & {groups: (Groups | Aliases)[]}) = typeof optionsOrAGroup === 'string'
            ? {
                groups: [optionsOrAGroup, ...groups || []],
                captureMode: 'none'
            }
            : {
                ...optionsOrAGroup,
                groups: [...optionsOrAGroup.groups || [], ...groups || []]
            }
        const groupObjects = (() => {
            const object: RegexCaptureOptions<(Groups | Aliases), '^'|'^$'|'$'|'none'>['groups'] = {} as any
            for (const group of options.groups) {
                object[group] = this.compile(group as any)
            }
            return object
        })()
        return RegexModule.capture<Groups | Aliases, '^'|'^$'|'$'|'none'>(string, {
            ...options as Omit<typeof options, 'groups'>,
            groups: groupObjects
        }) as any
    }

    /**
     * Returns an array with all captures in a string.
     */
    public static capture<Groups extends string, CaptureMode extends '^'|'^$'|'$'|'none'>(
        string: string,
        options: RegexCaptureOptions<Groups, CaptureMode>
    ): Array<RegexMatchesPerCaptureGroup<Groups>> {        
        // Convert the groups
        let newGroups: typeof options.groups = {} as any
        for (const group of Object.keys(options.groups)) {
            (newGroups as any)[`anything_before_${group}`] = /([\S\s]*?)/;
            (newGroups as any)[group] = (options.groups as any)[group]
        }
        options.groups = newGroups
        
        // Variables
        let regex = ''
        options.flags = ['g', ...(options.flags || '').split('')].map((v) => v.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join('') as RegexFlags
        options.captureMode = options.captureMode || 'none' as any

        // Create the regex
        for(const group of Object.keys(options.groups) as Array<keyof typeof options.groups>) {
            const name = /^[0-9]+$/.test(group)
                ? null
                : group
            const index = /^[0-9]+$/.test(group)
                ? String(group)
                : null
            const groupValue = options.groups[group]
            const optional = groupValue instanceof RegExp
                ? false
                : groupValue.optional || false
            const quantifier = groupValue instanceof RegExp
                ? null
                : groupValue.quantifier
            const groupRegex = groupValue instanceof RegExp
                ? new RegExp(groupValue, 'g')
                : (
                    groupValue.pattern instanceof RegexModule
                        ? new RegExp((groupValue.pattern)._compile(), 'g')
                        : new RegExp(groupValue.pattern, 'g')
                )
            if (name?.length || index?.length) {
                const captureGroup = [
                    // Wrap the group if optional
                    !optional ? ''
                    : '(',

                    // The named capture group
                    `(?`,
                        `<${name || `group_${index}`}>`,
                        `${groupRegex.source}`,
                    `)`,

                    // Add quantifier
                    quantifier || '',

                    // Close the group if optional
                    !optional ? ''
                    : ')?'
                ].join('')
                regex += captureGroup
            }
            else {
                throw Error('Cannot assign group to regex: Invalid name or index...')
            }
        }
    
        // Process the capture mode into the regex
        if (options.captureMode !== 'none') {
            switch (options.captureMode) {
                case '$': {
                    regex += '$'
                }
                case '^': {
                    regex = '^' + regex
                }
                case '^$': {
                    regex = `^${regex}$`
                }
            }
        }

        // Find the matches
        const allMatches = string.matchAll(new RegExp(regex, options.flags))
        let match = allMatches.next()

        // Process the matches
        const groups: Array<RegexMatchesPerCaptureGroup<Groups>> = []
        while (match.value && match.value.groups) {
            const group: any = {}
            for (const groupName of Object.keys(match.value.groups)) {
                group[groupName] = match.value.groups[groupName]
            }
            groups.push(group)
            match = allMatches.next()
        }
        
        return groups as any
    }

    /**
     * Parses a variable into a Regex instance.
     * @param variable the variable
     * @returns the Regex instance
     */
    private static parseVariable = <Aliases extends string, OptionalAliases extends string>(variable: string): RegexModule<RegexBuilderAliasKeywords|Aliases, OptionalAliases> => {
        let temporaryValue = 'x'
        while (variable.includes(temporaryValue)) {
            temporaryValue += 'x'
        }
        return new RegexModule<Aliases|RegexBuilderAliasKeywords, OptionalAliases>(new RegExp(
            variable
                .replace(/\\\\/g, temporaryValue)
                .replace(/\\/g, '\\\\')
                .replace(/\//g, '\\\/')
                .replace(/\^/g, '\\^')
                .replace(/\$/g, '\\$')
                .replace(/\./g, '\\.')
                .replace(/\|/g, '\\|')
                .replace(/\?/g, '\\?')
                .replace(/\*/g, '\\*')
                .replace(/\+/g, '\\+')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/\[/g, '\\[')
                .replace(/\]/g, '\\]')
                .replace(/\{/g, '\\{')
                .replace(/\}/g, '\\}')
                .replace(/\-/g, '\\-')
                .replace(new RegExp(temporaryValue, 'g'), '\\\\')
        ))
    }

    /**
     * Adds an alias to the regex builder.
     * @param name the name
     * @param regex the regex
     */
    public static alias<T extends Exclude<string, ''|RegexBuilderAliasKeywords>>(name: Exclude<T, ''|RegexBuilderAliasKeywords>, callback: RegExp | T | Pick<RegexModule<T>, RegexBuilderPropertiesNested> | ((regex: (...args: Array<RegExp | PickRegex<RegexBuilderAliasKeywords, ""> | (() => string)>) => Pick<RegexModule<T>, RegexBuilderPropertiesNestedAll>, helpers: RegexHelpers<T>) => PickRegex<RegexBuilderAliasKeywords, "">)): RegexModule<T|RegexBuilderAliasKeywords, `${T}?` | `${T}+` | `${T}*` | `${T}*?` | `${T}+?`> {
        return new RegexModule<T, `${T}${`?`|'*'|`+`|`+?`}`>()
            .alias(name as any, callback as any)
    }

    /**
     * Adds an alias to the Regex builder.
     * 
     * @param name The name
     * @param regex The regex
     * @returns The instance
     */
    public alias<T extends Exclude<string, ''|Aliases|OptionalAliases>>(name: Exclude<T, ''|Aliases|OptionalAliases>, callback: RegExp | Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNested> | Aliases | OptionalAliases | (() => string) | ((regex: (...args: Array<RegExp | PickRegex<Aliases, OptionalAliases> | Aliases | OptionalAliases | (() => string)>) => Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNestedAll>, helpers: RegexHelpers<Aliases, OptionalAliases>) => PickRegex<Aliases, OptionalAliases>)): RegexModule<Aliases|T, OptionalAliases | `${T}?` | `${T}*` | `${T}*?` | `${T}+` | `${T}+?`> {
        this.aliases[name] = callback instanceof RegExp
            ? new RegexModule(callback)
            : (
                callback instanceof RegexModule
                ? callback
                : (
                    typeof callback === 'string'
                    ? this.aliases[callback]
                    : (
                        typeof callback === 'function' && callback.length === 0
                        ? RegexModule.parseVariable((callback as Function)() as string)
                        :
                        (callback as any)((...args: Array<RegExp | PickRegex<Aliases, OptionalAliases> | Aliases | OptionalAliases | (() => string)>) => {
                            return this.callback(...args)
                        }, this as any)
                    )
                )
            )
        const setAliases = (parent: RegexModule<Aliases, OptionalAliases>) => {
            parent.aliases = this.aliases
            for (const child of parent.children) {
                setAliases(child)
            }
        }
        setAliases(this)
        setAliases(this.aliases[name])
        return this.aliases[name] as RegexModule<Aliases|T, OptionalAliases | `${T}?` | `${T}*` | `${T}*?` | `${T}+` | `${T}+?`>
    }

    /**
     * Compiles a regex based on the options.
     * 
     * @param callback the callback
     * @returns the instance
     */
    public static compile = <Aliases extends string>(callback: RegExp|RegexBuilderAliasKeywords|((regex: (...args: Array<PickRegex<Aliases, ""> | RegExp | (() => string)>) => Pick<RegexModule<Aliases>, RegexBuilderPropertiesNested>, helpers: RegexHelpers<Aliases>) => Pick<RegexModule<Aliases>, RegexBuilderPropertiesNested>), flags?: UniqueCombinations<RegexFlags>): RegExp => {
        return new RegexModule<Aliases|RegexBuilderAliasKeywords>().compile(callback, flags)
    }

    /**
     * Generates a regex based on the options.
     * 
     * @param callback the callback
     * @returns the instance
     */
    public compile = (callback: RegExp|Aliases|OptionalAliases|(() => string)|((regex: (...args: Array<PickRegex<Aliases, OptionalAliases> | RegExp | Aliases | OptionalAliases | (() => string)>) => Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNested>, helpers: RegexHelpers<Aliases, OptionalAliases>) => Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNested>), flags?: UniqueCombinations<RegexFlags>): RegExp => {
        if (callback instanceof RegExp) {
            return callback
        }
        else if (typeof callback === 'string') {
            const findAlias = (alias: string, options: {
                plusSign?: boolean
                _optional?: boolean
                allExcept?: boolean
                quantifierUnlimited?: boolean,
                unlimitedQuestionmark?: boolean
            } = {}): RegexModule<Aliases, OptionalAliases>|null => {
                if (this.aliases[alias]) {
                    const regex = new RegexModule(this.aliases[alias])
                    regex.aliases = this.aliases
                    if (options.plusSign) {
                        regex.plusSign = true
                    }
                    if (options.unlimitedQuestionmark) {
                        regex.quantifierAsterix = true
                        regex._optional = true
                    }
                    if (options.quantifierUnlimited) {
                        regex.quantifierAsterix = true
                    }
                    if (options._optional) {
                        regex._optional = true
                    }
                    if (options.allExcept) {
                        regex.allExcept = true
                    }
                    return regex
                }
                else {
                    if (alias.endsWith('*?')) {
                        return findAlias(alias.substring(0, alias.length - 2), {
                            ...options,
                            unlimitedQuestionmark: true
                        })
                    }
                    else if (alias.startsWith('[^') && alias.endsWith(']')) {
                        return findAlias(alias.substring(2, alias.length - 1), {
                            ...options,
                            allExcept: true
                        })
                    }
                    else if (alias.endsWith('?')) {
                        return findAlias(alias.substring(0, alias.length - 1), {
                            ...options,
                            _optional: true
                        })
                    }
                    else if (alias.endsWith('+')) {
                        return findAlias(alias.substring(0, alias.length - 1), {
                            ...options,
                            plusSign: true
                        })
                    }
                    else if (alias.endsWith('*')) {
                        return findAlias(alias.substring(0, alias.length - 1), {
                            ...options,
                            quantifierUnlimited: true
                        })
                    }
                    else {
                        return null
                    }
                }
            }
            const alias = findAlias(callback)
            if (!alias) {
                throw Error(`Could not find alias for regex: "${callback}"`)
            }
            return alias._compile(flags)
        }
        else if (typeof callback === 'function') {
            if (callback.length === 0) {
                return RegexModule.parseVariable((callback as Function)() as string)._compile(flags)
            }
            else {
                return (callback((...args: Array<PickRegex<Aliases, OptionalAliases> | RegExp | Aliases | OptionalAliases | (() => string)>) => {
                    return this.callback(...args)
                }, this as any) as RegexModule<Aliases, OptionalAliases>)
                    ._compile(flags)
            }
        }
        else {
            throw Error(`Invalid object given in Regex.compile: "${callback}"`)
        }
    }

    /**
     * Compiles the regex, automatically adds the global flag
     * 
     * @returns The regex
     */
    private _compile = (flags?: string, level: number = 0): RegExp => {
        flags = flags ? flags.includes('g') ? flags : `g${flags}` : 'g'
        let regex = this.regex
            ? this.regex.source
            : this.children.map((child) => {
                const source = child._compile(flags, level + 1).source
                if (source.startsWith('(')) {
                    return source
                }
                return `(${source})`
            }).join('')
            // : this.children.map((child) => child._compile(flags).source).join('')
        if (!this.regex) {
            if (this.orStatements.length) {
                regex = `((${regex})|${this.orStatements.map((v) => `(${v._compile(flags, level + 1).source})`).join('|')})`
            }
        }
        if (this.plusSign) {
            regex = `(${regex})+`
        }
        if (this.quantifierAsterix && this._optional) {
            regex = `(${regex})*?`
        }
        else {
            if (this.quantifierAsterix) {
                regex = `(${regex})*`
            }
        }
        if (this._quantifier) {
            regex = `(${regex})${this._quantifier}`
        }
        if (this.allExcept) {
            regex = `[^${regex}]`
        }
        if (this._optional && !this.quantifierAsterix) {
            regex = `(${regex})?`
        }
        if (level === 0) {
            regex = regex.replace(/{{{{{regex_until_end_123456789}}}}}(?=([^{{{{{regex_until_end_123456789}}}}}]+)?$)/, '$')
            regex = regex.replace(/{{{{{regex_until_end_123456789}}}}}/, '')
        }
        return new RegExp(regex, flags || this.getFlags())
    }

    /**
     * Set the flags
     * 
     * @param flags the flags
     */
    public static flags = (flags: UniqueCombinations<RegexFlags>): Pick<RegexModule<RegexBuilderAliasKeywords>, RegexBuilderPropertiesAfterFlags> => {
        const regex = new RegexModule<RegexBuilderAliasKeywords>()
        regex._flags = flags
        return regex
    }

    /**
     * Set the flags
     * 
     * @param flags the flags
     */
    public flags = (flags: UniqueCombinations<RegexFlags>): Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesAfterFlags> => {
        this._flags = flags
        return this as never
    }

    /**
     * Callback, but it returns a RegExp instance.
     * @param args The arguments
     * @returns The regexp instance
     */
    public callbackRegExp(...args: Array<PickRegex<Aliases, OptionalAliases> | RegExp | Aliases | OptionalAliases | (() => string)>): RegExp {
        return (this.callback(...args) as RegexModule<Aliases, OptionalAliases>)._compile()
    }

    /**
     * The callback within `Regex.compile()` and `Regex.alias()`.
     * @param args The args
     * @returns The callback
     */
    public callback(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|PickRegex<Aliases, OptionalAliases> | RegExp | Aliases | OptionalAliases | (() => string)>): Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNested> {
        const children: Array<RegexModule<Aliases, OptionalAliases>> = []
        for (let i = 0; i < args.length; i ++) {
            const arg = args[i]
            if (typeof arg === 'object' && !(arg instanceof RegexModule || arg instanceof RegExp)) {
                const until: RegExp|null = (arg as any).until
                const behindUntil: RegExp|null = (arg as any).behindUntil

                if (until !== undefined) {
                    if (until) {
                        children.push(new RegexModule(until))
                    }
                    else {
                        if (i < args.length - 1) {
                            const ahead: RegexModule<Aliases, OptionalAliases> = this.generateChildren(
                                ...args.filter((v, j) => j > i)
                            )
                            let source = ahead._compile().source
                            if (
                                (source.length >= 2 && ['?:', '?!', '?=', '?<'].includes(source.substring(0, 2)))
                                || (source.length >= 3 && ['?<!', '?<='].includes(source.substring(0, 3)))
                            ) {
                                source = `(${source})`
                            }
                            children.push(new RegexModule(new RegExp(`.*?(?=${source}{{{{{regex_until_end_123456789}}}}})`)))
                        }
                    }
                }
                else if (behindUntil !== undefined) {
                    if (behindUntil) {
                        children.push(new RegexModule(behindUntil))
                    }
                    else {
                        if (i < args.length - 1) {
                            const ahead: RegexModule<Aliases, OptionalAliases> = this.generateChildren(
                                ...args.filter((v, j) => j > i)
                            )
                            let source = ahead._compile().source
                            if (
                                (source.length >= 2 && ['?:', '?!', '?=', '?<'].includes(source.substring(0, 2)))
                                || (source.length >= 3 && ['?<!', '?<='].includes(source.substring(0, 3)))
                            ) {
                                source = `(${source})`
                            }
                            children.push(new RegexModule(new RegExp(`(?<=.*?(?=${source}{{{{{regex_until_end_123456789}}}}}))`)))
                        }
                    }
                }
            }
            else if (typeof arg === 'string') {
                if (arg === 'begin') {
                    children.push(new RegexModule(/^/))
                }
                else if (arg === 'end') {
                    children.push(new RegexModule(/$/))
                }
                if (this.aliases[arg]) {
                    children.push(this.aliases[arg])
                }
                else if (arg.endsWith('?')) {
                    let alias = this.aliases[arg.substring(0, arg.length - (arg.match(/(\+|\*)\?+$/g) ? 2 : 1))]
                    let copy = new RegexModule<Aliases, OptionalAliases>()
                    copy.aliases = Object.assign({}, alias.aliases)
                    copy.children = alias.children
                    copy._optional = true
                    if (arg.endsWith('+?')) {
                        copy.plusSign = true
                    }
                    if (arg.endsWith('*?')) {
                        copy.quantifierAsterix = true
                    }
                    copy.regex = alias.regex
                    children.push(copy)
                    
                }
                else if (arg.endsWith('+')) {
                    let alias = this.aliases[arg.substring(0, arg.length - 1)]
                    let copy = new RegexModule<Aliases, OptionalAliases>()
                    copy.aliases = Object.assign({}, alias.aliases)
                    copy.children = alias.children
                    copy.plusSign = true
                    copy.regex = alias.regex
                    children.push(copy)
                }
                else if (arg.endsWith('*')) {
                    let alias = this.aliases[arg.substring(0, arg.length - 1)]
                    let copy = new RegexModule<Aliases, OptionalAliases>()
                    copy.aliases = Object.assign({}, alias.aliases)
                    copy.children = alias.children
                    copy.quantifierAsterix = true
                    copy.regex = alias.regex
                    children.push(copy)
                }
                else if (arg.startsWith('[^') && arg.endsWith(']')) {
                    let alias = this.aliases[arg.substring(2, arg.length - 1)]
                    let copy = new RegexModule<Aliases, OptionalAliases>()
                    copy.aliases = Object.assign({}, alias.aliases)
                    copy.children = alias.children
                    copy.allExcept = true
                    copy.regex = alias.regex
                    children.push(copy)
                }
            }
            else if (arg instanceof RegExp) {
                children.push(new RegexModule(arg))
            }
            else if (arg instanceof RegexModule) {
                children.push(arg)
            }
            else if (typeof arg === 'function') {
                children.push(RegexModule.parseVariable<Aliases, OptionalAliases>((arg as Function)() as string) as any)
                
            }
        }
        const regex = new RegexModule(...children)
        regex.aliases = this.aliases
        const setAliases = (regex: RegexModule<Aliases, OptionalAliases>) => {
            for (const child of regex.children) {
                child.aliases = regex.aliases
                setAliases(child)
            }
        }
        setAliases(regex)
        return regex
    }

    /**
     * Get all flags used within the regex node
     * @returns The flags
     */
    private getFlags = (): UniqueCombinations<RegexFlags> => {
        if (this._flags) {
            return this._flags
        }
        const findFlags = (regex: RegexModule<Aliases, OptionalAliases>): string[] => {
            if (regex.regex) {
                return regex.regex.flags.split('')
            }
            else {
                const flags: string[][] = []
                for (const child of regex.children) {
                    if (child.regex) {
                        flags.push(child.regex.flags.split(''))
                    }
                    else {
                        flags.push(findFlags(child))
                    }
                }
                return flags.reduce((x, y) => x.concat(y), [])
            }
        }
        return findFlags(this).filter((v, i, a) => a.indexOf(v) === i).join('') as UniqueCombinations<RegexFlags>
    }

    /**
     * Combines the regex with this or statement
     * 
     * @param args the arguments to build a new `Regex` instance
     */
    public or(...args: Array<RegExp | PickRegex<Aliases, OptionalAliases> | Aliases | OptionalAliases | (() => string)>): Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNested> {
        if (args.length) {
            const regex = this.callback(...args)
            this.orStatements.push(regex as RegexModule<Aliases, OptionalAliases>)
        }
        return this
    }

    /**
     * Sets the quantifier for the regex
     * 
     * @param quantifier The quantifier
     */
    public quantifier(quantifier: string | RegExp): Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNestedAfterQuantifier> {
        this._quantifier = quantifier instanceof RegExp
            ? quantifier.source
            : quantifier
        return this
    }

    /**
     * Makes a regex optional
     */
    // TODO: return type should be able to set to never
    public optional(): Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNested> {
        this._optional = true
        return this
    }

    /**
     * Generates the children for the helper functions.
     */
    private generateChildren = (...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegexModule<Aliases, OptionalAliases> => {
        const children: RegexModule<Aliases, OptionalAliases>[] = []
        for (let i = 0; i < args.length; i ++) {
            const arg = args[i]
            if (typeof arg === 'object' && !(arg instanceof RegexModule || arg instanceof RegExp)) {
                const until: RegExp|null = (arg as any).until
                const behindUntil: RegExp|null = (arg as any).behindUntil

                if (until !== undefined) {
                    if (until) {
                        children.push(new RegexModule(until))
                    }
                    else {
                        if (i < args.length - 1) {
                            const ahead: RegexModule<Aliases, OptionalAliases> = this.generateChildren(
                                ...args.filter((v, j) => j > i)
                            )
                            let source = ahead._compile().source
                            if (
                                (source.length >= 2 && ['?:', '?!', '?=', '?<'].includes(source.substring(0, 2)))
                                || (source.length >= 3 && ['?<!', '?<='].includes(source.substring(0, 3)))
                            ) {
                                source = `(${source})`
                            }
                            children.push(new RegexModule(new RegExp(`.*?(?=${source}{{{{{regex_until_end_123456789}}}}})`)))
                        }
                    }
                }
                else if (behindUntil !== undefined) {
                    if (behindUntil) {
                        children.push(new RegexModule(behindUntil))
                    }
                    else {
                        if (i < args.length - 1) {
                            const ahead: RegexModule<Aliases, OptionalAliases> = this.generateChildren(
                                ...args.filter((v, j) => j > i)
                            )
                            let source = ahead._compile().source
                            if (
                                (source.length >= 2 && ['?:', '?!', '?=', '?<'].includes(source.substring(0, 2)))
                                || (source.length >= 3 && ['?<!', '?<='].includes(source.substring(0, 3)))
                            ) {
                                source = `(${source})`
                            }
                            children.push(new RegexModule(new RegExp(`(?<=.*?(?=${source}{{{{{regex_until_end_123456789}}}}}))`)))
                        }
                    }
                }
            }
            else if (typeof arg === 'string') {
                if (arg === 'begin') {
                    children.push(new RegexModule(/^/))
                }
                else if (arg === 'end') {
                    children.push(new RegexModule(/$/))
                }
                else if (this.aliases[arg]) {
                    children.push(this.aliases[arg])
                }
                else if (arg.endsWith('?')) {
                    if (arg.endsWith('*?')) {
                        const child = new RegexModule(this.aliases[arg.replace(/\*\?$/g, '')])
                        child.aliases = this.aliases
                        child.quantifierAsterix = true
                        child._optional = true
                        children.push(child)
                    }
                    else if (arg.endsWith('+?')) {
                        const child = new RegexModule(this.aliases[arg.replace(/\+\?$/g, '')])
                        child.aliases = this.aliases
                        child.plusSign = true
                        child._optional = true
                        children.push(child)
                    }
                    else {
                        const child = new RegexModule(this.aliases[arg.replace(/\?$/g, '')])
                        child.aliases = this.aliases
                        child._optional = true
                        children.push(child)
                    }
                }
                else if (arg.endsWith('+')) {
                    const child = new RegexModule(this.aliases[arg.replace(/\+$/g, '')])
                    child.aliases = this.aliases
                    child.plusSign = true
                    children.push(child)
                }
                else if (arg.endsWith('*')) {
                    const child = new RegexModule(this.aliases[arg.replace(/\*$/g, '')])
                    child.aliases = this.aliases
                    child.quantifierAsterix = true
                    children.push(child)
                }
            }
            else if (typeof arg === 'function') {
                children.push(RegexModule.parseVariable<Aliases, OptionalAliases>((arg as Function)() as string) as any)
            }
            else if (arg instanceof RegExp) {
                children.push(new RegexModule<Aliases, OptionalAliases>(arg))
            }
            else if (arg instanceof RegexModule) {
                children.push(arg)
            }
        }
        return new RegexModule<Aliases, OptionalAliases>(...children)
    }

    /**
     * A not statement
     * @returns the statement
     */
    public not(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegexModule<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source
        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++
                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`[^${source}]`)
    }

    /**
     * A lookahead statement
     * @returns the statement
     */
    public lookahead(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {            
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++
                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`(?=${source})`)
    }

    /**
     * A lookbehind statement
     * @returns the statement
     */
    public lookbehind(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0            
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++
                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`(?<=${source})`)
    }

    /**
     * A negative lookahead statement
     * @returns the statement
     */
    public negativeLookahead(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]                
                if (char === '(') {
                    level ++
                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`(?!${source})`)
    }

    /**
     * A negative lookbehind statement
     * @returns the statement
     */
    public negativeLookbehind(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`(?<!${source})`)
    }

    /**
     * A non-captured group
     * @returns the statement
     */
    public uncaptured(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`(?:${source})`)
    }

    /**
     * Match until
     * @returns the statement
     */
    public until(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): { until: RegExp|null }|{ behindUntil: RegExp|null } {
        if (args.length) {
            const regex = this.generateChildren(...args)
            let source = regex._compile().source
    
            if (source.startsWith('(') && source.endsWith(')')) {
                let endParenIndex: number|null = null
                let level = 0
                for (let i = 0; i < source.length; i ++) {
                    const char = source[i]
                    if (char === '(') {
                        level ++                }
                    else if (char === ')') {
                        level --
                        if (level === 0) {
                            if (i === source.length - 1) {
                                endParenIndex = i
                            }
                            break
                        }
                    }
                }
                if (endParenIndex !== null) {
                    source = source.substring(1, source.length - 1)
                }
            }
            return {
                until: new RegExp(`.*?(?=${source})`)
            }
        }
        return {
            until: null
        }
    }

    /**
     * Match behind until
     * @returns the statement
     */
    public behindUntil(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): { behindUntil: RegExp|null } {
        if (args.length) {
            const regex = this.generateChildren(...args)
            let source = regex._compile().source
    
            if (source.startsWith('(') && source.endsWith(')')) {
                let endParenIndex: number|null = null
                let level = 0
                for (let i = 0; i < source.length; i ++) {
                    const char = source[i]
                    if (char === '(') {
                        level ++                }
                    else if (char === ')') {
                        level --
                        if (level === 0) {
                            if (i === source.length - 1) {
                                endParenIndex = i
                            }
                            break
                        }
                    }
                }
                if (endParenIndex !== null) {
                    source = source.substring(1, source.length - 1)
                }
            }
            return {
                behindUntil: new RegExp(`(?<=.*?(?=${source}))`)
            }
        }
        return {
            behindUntil: null
        }
    }

    /**
     * Creates groups of every argument with a name.
     * @returns the statement
     */
    public groups(...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        let regex = new RegexModule()
        for (let i = 0; i < args.length; i ++) {
            const arg = args[i]
            let child = this.generateChildren(arg)
            let source = child._compile().source
            if (typeof arg === 'object' && !(arg instanceof RegexModule || arg instanceof RegExp)) {
                child = this.generateChildren(arg, ...args.filter((v, j) => j > i)).children[0]
                source = child._compile().source
            }
            if (source.startsWith('(') && source.endsWith(')')) {
                let endParenIndex: number|null = null
                let level = 0
                for (let i = 0; i < source.length; i ++) {
                    const char = source[i]
                    if (char === '(') {
                        level ++                }
                    else if (char === ')') {
                        level --
                        if (level === 0) {
                            if (i === source.length - 1) {
                                endParenIndex = i
                            }
                            break
                        }
                    }
                }
                if (endParenIndex !== null) {
                    source = source.substring(1, source.length - 1)
                }
            }
            if (
                (source.length >= 2 && ['?:', '?!', '?=', '?<'].includes(source.substring(0, 2)))
                || (source.length >= 3 && ['?<!', '?<='].includes(source.substring(0, 3)))
            ) {
                regex.children.push(new RegexModule(new RegExp(`(${source})`)))
            }
            else if (source.startsWith('.*?')) {
                regex.children.push(new RegexModule(new RegExp(`(${source})`)))
            }
            else {
                regex.children.push(new RegexModule(new RegExp(`(?<group_${i + 1}>${source})`)))
            }
        }

        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        if (
            (source.length >= 2 && ['?:', '?!', '?=', '?<'].includes(source.substring(0, 2)))
            || (source.length >= 3 && ['?<!', '?<='].includes(source.substring(0, 3)))
        ) {
            source = `(${source})`
        }
        return new RegExp(source)
    }

    /**
     * A non-captured group
     * @returns the statement
     */
    public named(name: string, ...args: Array<{ until: RegExp|null }|{ behindUntil: RegExp|null }|Aliases|OptionalAliases|RegexHelpers<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|PickRegex<Aliases, OptionalAliases>|RegExp|(() => string)>): RegExp {
        const regex = this.generateChildren(...args)
        let source = regex._compile().source

        if (source.startsWith('(') && source.endsWith(')')) {
            let endParenIndex: number|null = null
            let level = 0
            for (let i = 0; i < source.length; i ++) {
                const char = source[i]
                if (char === '(') {
                    level ++                }
                else if (char === ')') {
                    level --
                    if (level === 0) {
                        if (i === source.length - 1) {
                            endParenIndex = i
                        }
                        break
                    }
                }
            }
            if (endParenIndex !== null) {
                source = source.substring(1, source.length - 1)
            }
        }
        return new RegExp(`(?<${name}>${source})`)
    }
}