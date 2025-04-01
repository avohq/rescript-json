module Decode = Json_decode
module Encode = Json_encode
type exn +=  ParseError(string)
let parse: string => option<Js.Json.t>
let parseOrRaise: string => Js.Json.t
@val external stringify: Js.Json.t => string = "JSON.stringify"
