import { crc32 } from "node:zlib"

const u16 = (value: number) => [value & 255, (value >>> 8) & 255]
const u32 = (value: number) => [...u16(value), ...u16(value >>> 16)]
export const readerDocument = (): Uint8Array => {
  const entries = {
    mimetype: "application/vnd.oasis.opendocument.text",
    "content.xml":
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>consumerdocumentneedle Привет</text:p></office:text></office:body></office:document-content>',
  }
  const local: number[] = [],
    central: number[] = []
  for (const [name, value] of Object.entries(entries)) {
    const path = [...new TextEncoder().encode(name)],
      data = new TextEncoder().encode(value),
      offset = local.length
    const metadata = [...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc32(data)), ...u32(data.length)]
    local.push(...u32(0x04034b50), ...metadata, ...u32(data.length), ...u16(path.length), ...u16(0), ...path, ...data)
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...metadata,
      ...u32(data.length),
      ...u16(path.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...path,
    )
  }
  return new Uint8Array([
    ...local,
    ...central,
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(2),
    ...u16(2),
    ...u32(central.length),
    ...u32(local.length),
    ...u16(0),
  ])
}
export const readerText = (): Uint8Array => {
  const text = "consumerencodingneedle Привет"
  const result = new Uint8Array(2 + text.length * 2),
    view = new DataView(result.buffer)
  result.set([0xff, 0xfe])
  for (let index = 0; index < text.length; index++) view.setUint16(2 + index * 2, text.charCodeAt(index), true)
  return result
}
