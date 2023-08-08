import fs from 'fs'
import { RegexModule } from './lib/regex/regex.module'
import path from 'path'

/**
 * A deserializer for .gitignore files.
 * @author Stan Hurks
 */
export default class Deserializer {
    /**
     * The cache of deserializers so you don't need to define a deserializer object as a property
     */
    private static cache: Deserializer[] = []

    /**
     * The path to the .gitignore file
     */
    private rootPath: string

    /**
     * The timestamp at which this .gitignore file has been modified for the last time
     */
    private mtimeMs: number

    /**
     * The content of the .gitignore file
     */
    private content: string

    /**
     * The rules in the gitignore file as regexes
     */
    private rules: { negate: boolean, regex: RegExp }[]

    /**
     * Constructor
     * @param rootPath the path to the directory containing the .gitignore
     * @throws when the gitignore file couldn't be read for any reason
     */
    private constructor(rootPath: string) {
        try {
            this.rootPath = rootPath.replace(/\\/g, '/')
            if (!this.rootPath.endsWith('/')) {
                this.rootPath += '/'
            }
            fs.accessSync(path.join(rootPath, '.gitignore'))
            this.mtimeMs = fs.lstatSync(path.join(rootPath, '.gitignore')).mtimeMs
            const file = fs.readFileSync(path.join(rootPath, '.gitignore'))
            this.content = file.toString('utf8')
            this.rules = this.content.split(/\r\n|\n|\r/)
                // No empty lines
                .filter((line) => line.trim().length)
                
                // No lines that start with a space
                .filter((line) => !line.startsWith(' '))

                // # is comment
                .filter(line => !line.includes('#'))

                // No invalid lines
                .filter(line => {
                    const notAllowed = ['^', '\\', ':', '"', '<', '>', '|', '\t']
                    for (const entry of notAllowed) {
                        if (line.includes(entry)) {
                            return false
                        }
                    }
                    return true
                })

                // Remove invalid trailing/leading spaces
                .map(line => line.replace(/\\ /g, '"\\ "').trim().replace(/\"\\ \"/g, '\\ '))

                // Check all lines
                .map((line) => {
                    const original = line
                    try {
                        let aliases = RegexModule
                            .alias('any', /.*/)
                            .alias('separator', /\//)
                            .alias('directory or file name', /[^\\\/:"*?<>|\n]+/)
                            .alias('any directory', regex =>
                                regex(
                                    regex('directory or file name', /\//).quantifier('*'),
                                )
                            )
                            .alias('any directory or file', regex => regex(
                                regex(
                                    regex(
                                        'directory or file name', /\//
                                    ).quantifier('+'),
                                    'directory or file name'
                                )
                                .or(
                                    'directory or file name'
                                )
                            ))
                        const regex: Array<Parameters<typeof aliases.compile>[0]> = []
                        function escape(line: string) {
                            return line
                                .replace(/\\/g, '\\\\')
                                .replace(/\//g, '\\\/')
                                .replace(/\^/g, '\\^')
                                .replace(/\</g, '\\<')
                                .replace(/\>/g, '\\>')
                                .replace(/\$/g, '\\$')
                                .replace(/\./g, '\\.')
                                .replace(/\|/g, '\\|')
                                .replace(/\+/g, '\\+')
                                .replace(/\(/g, '\\(')
                                .replace(/\)/g, '\\)')
                                .replace(/\{/g, '\\{')
                                .replace(/\}/g, '\\}')
                                .replace(/\-/g, '\\-')
                                .replace(/\*/g, '[^\\/\\n]*')
                                .replace(/\?/g, '[^\\/\\n]')
                        }
                        function startsWith(substring: string) {
                            const pos = line.indexOf(substring)
                            if (pos === 0) {
                                line = line.substring(substring.length)
                            }
                            return pos === 0
                        }
                        function isEmpty() {
                            return !line.length
                        }
                        
                        // Negate the regex if the line starts with a !
                        const negate = startsWith('!')
    
                        // Loop through the segments
                        function loop() {
                            const segments = line.split('/')
                            for (let i = 0; i < segments.length; i ++) {
                                const segment = segments[i]
                                if (segment === '*') {
                                    if (segments.length === i + 1) {
                                        // Match files and directories
                                        regex.push(aliases.compile((regex) => 
                                            regex('directory or file name', /\/?$/)
                                                .or('directory or file name', /\//, 'any directory or file', /$/)
                                        ))
                                        break
                                    }
                                    else {
                                        // Match directories only
                                        regex.push('directory or file name', /\//)
    
                                        // Break if the next segment is a slash and its the last
                                        if (segments[i + 1] === '') {
                                            regex.push(aliases.compile((regex) => regex('any directory or file?', /\/?/).optional()), /$/)
                                            break
                                        }
                                    }
                                }
                                else if (segment === '**') {
                                    if (segments.length === i + 1) {
                                        // Match files and directories
                                        regex.push('any directory or file', /\/?$/)
                                        break
                                    }
                                    else {
                                        // Match directories only
                                        regex.push('any directory')
    
                                        // Break if the next segment is a slash and its the last
                                        if (segments[i + 1] === '') {
                                            regex.push('any directory or file?', /$/)
                                            break
                                        }
                                    }
                                }
                                else {
                                    const escaped = escape(segment)
                                    if (segments.length === i + 1) {
                                        // End with this pattern
                                        regex.push(new RegExp(escaped), aliases.compile((regex) => regex(/\//, 'any directory or file?', /\/?/).optional()), /$/)
                                    }
                                    else {
                                        // The pattern is a directory
                                        regex.push(new RegExp(escaped), /\//)
    
                                        // Break if the next segment is a slash and its the last
                                        if (segments[i + 1] === '') {
                                            regex.push(aliases.compile((regex) => regex('any directory or file?', /\/?/).optional()), /$/)
                                            break
                                        }
                                    }
                                }
                            }
                        }
    
                        // Everything is ignored
                        if (!line.replace(/\*/g, '').length) {
                            console.warn('Everything in your .gitignore file at path "' + rootPath + '" is ignored, due to a line containing only * characters.')
                        }

                        // Look only in the root
                        else if (startsWith('/')) {
                            if (!isEmpty()) {
                                regex.push(/^\//)
                                loop()
                            }
                            else {
                                regex.push('any directory or file?', /\/?$/)
                            }
                        }
                        
                        // Matches any directory in the root
                        else if (startsWith('*/')) {
                            regex.push(/^\//, 'directory or file name', /\//)
                            
                            // Loop through the segments
                            if (!isEmpty()) {
                                loop()
                            }
                            else {
                                regex.push('any directory or file?', /\/?$/)
                            }
                        }
    
                        // Match in any directory
                        else {
                            // Remove the **/
                            startsWith('**/')

                            // Path starts with a /
                            regex.push(/\//)
                            
                            // Loop through the segments
                            loop()
                        }
    
                        // Return an object or null
                        return regex.length 
                            ? {
                                negate,
                                regex: aliases.compile((r) => r(...regex as Array<Parameters<typeof r>[0]>))
                            }
                            : null
                    }
                    catch (error) {
                        console.error(`Line in .gitignore file: "${original}" is invalid:\n` + (error as Error).message)
                        return null
                    }
                })

                // Remove the failed (null) expressions
                .filter(v => v !== null) as { negate: boolean, regex: RegExp }[]

            Deserializer.cache = Deserializer.cache.filter((v) => v.rootPath === this.rootPath && v.mtimeMs !== this.mtimeMs)
            if (!Deserializer.cache.filter((v) => v.rootPath === this.rootPath).length) {    
                Deserializer.cache.push(this)
            }
        }
        catch (error) {
            throw new Error(`Could not open .gitignore file:\n${(error as Error).message}`)
        }
    }

    /**
     * Checks if an absolute path is ignored
     * @param _path the path
     * @param type whether the path points to a file or directory, can be detected automatically but then the type will be checked and if the file/directory doesn't exist it will throw an error.
     * @returns true if the path is ignored by git
     * @throws an exception if anything goes wrong
     */
    public static isIgnored(_path: string, type: 'file'|'directory'|'detect' = 'detect'): boolean {
        // Determine the type automatically
        if (type === 'detect') {
            try {
                const stats = fs.lstatSync(_path)
                type = stats.isDirectory()
                    ? 'directory'
                    : 'file'
            }
            catch (error) {
                throw new Error(`File or directory "${_path}" was not found, so the gitignore deserializer could not determine whether it is ignored.`)
            }
        }
        
        // Find the closest gitignore
        let p = path.join(_path)
        let mtimeMs: number = 0
        while (true) {
            const p2 = path.join(p, '../')
            if (p === p2) {
                console.warn('No .gitignore found in any parent directory relative to the given path.')
                return false
            }
            try {
                fs.accessSync(path.join(p, '.gitignore'))
                mtimeMs = fs.lstatSync(path.join(p, '.gitignore')).mtimeMs
                break
            } catch (error) {}
            p = p2
        }

        // Gitignore is found, format the path and check if a deserializer has to be made or one is already cached.
        p = p.replace(/\\/g, '/')
        if (!p.endsWith('/')) {
            p += '/'
        }
        let deserializer = this.cache.find((v) => v.rootPath === p && v.mtimeMs === mtimeMs) || new Deserializer(p)

        // Modify the path based on the storage type
        _path = _path.replace(/\\/g, '/')
        if (type === 'directory' && !_path.endsWith('/')) {
            _path += '/'
        }
        if (type === 'file' && _path.endsWith('/')) {
            _path = _path.substring(0, _path.length - 1)
        }
        _path = _path.substring(deserializer.rootPath.length)
        if (!_path.startsWith('/')) {
            _path = '/' + _path
        }

        // Checks if the path is ignored
        let ignored = false
        for (const rule of deserializer.rules.filter((v) => !v.negate)) {
            const test = new RegExp(rule.regex).test(_path)
            if (test) {
                ignored = true
            }
        }
        if (ignored) {
            for (const rule of deserializer.rules.filter((v) => v.negate)) {
                if (new RegExp(rule.regex).test(_path)) {
                    return false
                }
            }
        }
        return ignored
    }
}