import { RegexModule } from "./regex.module"

/**
 * All possible combinations of a series of letters, without
 * using a letter more than once.
 * 
 * @author Stan Hurks
 */
export type UniqueCombinations<All extends string, Used extends string = ''> = ReturnType<() => {
    [Key in All]: Key extends Used
        ? never
        : Key | `${Key}${UniqueCombinations<All, Used | Key>}`
}>[All]

/**
 * The alias keywords
 */
export type RegexBuilderAliasKeywords = 'begin'|'end'

/**
 * Options after flags
 */
export type RegexBuilderPropertiesAfterFlags = 'compile'

/**
 * The properties that and `Regex.or` return as type.
 */
export type RegexBuilderPropertiesNested = RegexBuilderPropertiesNestedAll
    | RegexBuilderPropertiesNestedAfterQuantifier
    | RegexBuilderPropertiesNestedAfterOptional

/**
* All options
*/
export type RegexBuilderPropertiesNestedAll = 'or'|'quantifier'|'optional'

/**
* Options after the quantifier
*/
export type RegexBuilderPropertiesNestedAfterQuantifier = 'optional'

/**
 * Options after optional
 */
export type RegexBuilderPropertiesNestedAfterOptional = never

/**
* Shortcut for the functions.
*/
export type PickRegex<Aliases extends string, OptionalAliases extends string> = Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNestedAll>
    | Pick<RegexModule<Aliases, OptionalAliases>, RegexBuilderPropertiesNestedAfterQuantifier>
    | RegexBuilderPropertiesNestedAfterOptional

/**
* All regex flags
*/
export type RegexFlags = 'i' | 'g' | 'm' | 's' | 'u' | 'y'

/**
 * Regex helper functions
 */
export type RegexHelpers<Aliases extends string, OptionalAliases extends string = ''> = Pick<RegexModule<Aliases, OptionalAliases>, 'not'|'lookahead'|'lookbehind'|'negativeLookahead'|'negativeLookbehind'|'uncaptured'|'named'|'groups'|'until'>

/**
 * All regex matches for all capture groups given
 */
export type RegexMatchesPerCaptureGroup<Groups extends string> = {
    /**
     * The value per capture group
     */
    [group in Groups]: string
}

/**
 * The options for `Regex.capture`
 */
export type RegexCaptureOptions<Groups extends string, CaptureMode extends '^'|'^$'|'$'|'none' = 'none'> = {
    /**
     * The groups forming the full regex
     */
    groups: {[group in Groups]: 
        {
            /**
             * The pattern
             */
            pattern: RegExp

            /**
             * The quantifier
             */
            quantifier: string

            /**
             * Whether or not the group is optional
             */
            optional?: boolean 
        }
        | RegExp
    }

    /**
     * Whether to capture from the begin and/or to the end.
     * When the value is undefined, no restrictions will be applied.
     * 
     * Values: "^$" "^" "$"
     */
    captureMode?: CaptureMode

    /**
     * The flags, "g" is always included.
     */
    flags?: UniqueCombinations<RegexFlags>
}