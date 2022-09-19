import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { useSelector, shallowEqual } from 'react-redux'
import _ from 'lodash'
import moment from 'moment'
import { BiRightArrowAlt } from 'react-icons/bi'

import Copy from '../copy'
import Image from '../image'
import { getChain } from '../../lib/object/chain'
import { number_format, name, ellipse, to_json, decode_base64, json_theme } from '../../lib/utils'

const FORMATS = [
  { id: 'formatted', name: 'Formatted' },
  { id: 'json', name: 'JSON' },
]

const FORMATTABLE_TYPES = [
  'MsgSend',
  'ConfirmDeposit',
  'ConfirmERC20Deposit',
  'ConfirmERC20TokenDeployment',
  'ConfirmGatewayTx',
  'ConfirmTransferKey',
  'Vote',
  'MsgTransfer',
  'RetryIBCTransfer',
  'RouteIBCTransfers',
  'MsgUpdateClient',
  'MsgAcknowledgement',
]

export default ({
  data,
}) => {
  const { preferences, evm_chains, cosmos_chains, assets } = useSelector(state => ({ preferences: state.preferences, evm_chains: state.evm_chains, cosmos_chains: state.cosmos_chains, assets: state.assets }), shallowEqual)
  const { theme } = { ...preferences }
  const { evm_chains_data } = { ...evm_chains }
  const { cosmos_chains_data } = { ...cosmos_chains }
  const { assets_data } = { ...assets }

  const [txFormat, setTxFormat] = useState('formatted')
  const [logsFormat, setLogsFormat] = useState('formatted')

  useEffect(() => {
    const {
      raw_log,
      type,
      activities,
    } = { ...data }

    if (data) {
      if (!(
        FORMATTABLE_TYPES.includes(type) &&
        activities?.length > 0
      )) {
        setTxFormat('json')
      }

      if (!to_json(raw_log)) {
        setLogsFormat('json')
      }
    }
  }, [data])

  const ReactJson = typeof window !== 'undefined' &&
    dynamic(
      import('react-json-view')
    )

  const chains_data = _.concat(
    evm_chains_data,
    cosmos_chains_data,
  );

  const {
    tx,
    raw_log,
    type,
    activities,
  } = { ...data }
  const {
    messages,
  } = { ...tx?.body }

  const txFormattable = FORMATTABLE_TYPES.includes(type) &&
    activities?.length > 0

  const logsFormattable = !!to_json(raw_log)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <div className="text-lg font-bold">
            Activities
          </div>
          {txFormattable && (
            <div className="w-fit bg-slate-100 dark:bg-zinc-900 rounded-xl flex flex-wrap item-center space-x-1 p-1">
              {FORMATS.map((f, i) => {
                const {
                  id,
                  name,
                } = { ...f }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setTxFormat(id)}
                    className={`${id === txFormat ? 'bg-white dark:bg-black shadow dark:shadow-zinc-800 text-black dark:text-white font-semibold' : 'bg-transparent text-slate-400 dark:text-slate-600 hover:text-slate-800 dark:hover:text-slate-200 font-normal hover:font-medium'} rounded-lg py-1 px-2`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {txFormat === 'formatted' && txFormattable ?
          <div className="space-y-3">
            {activities.map((a, i) => {
              const {
                chain,
                sender,
                recipient,
                signer,
                deposit_address,
                burner_address,
                tx_id,
                asset_data,
                amount,
                poll_id,
                status,
                events,
                source_channel,
                destination_channel,
                packet,
                acknowledgement,
                timeout_timestamp,
              } = { ...a }
              let {
                sender_chain,
                recipient_chain,
                deposit_address_chain,
                symbol,
              } = { ...a }
              const {
                contracts,
                ibc,
              } = { ...asset_data }
              let {
                image,
              } = { ...asset_data }

              sender_chain = sender_chain ||
                chains_data?.find(c => sender?.startsWith(c?.prefix_address))?.id

              recipient_chain = recipient_chain ||
                chains_data?.find(c => recipient?.startsWith(c?.prefix_address))?.id

              deposit_address_chain = deposit_address_chain ||
                chains_data?.find(c => deposit_address?.startsWith(c?.prefix_address))?.id

              const chain_data = getChain(
                chain,
                chains_data,
              )

              const sender_chain_data = getChain(
                sender_chain,
                chains_data,
              )

              const recipient_chain_data = getChain(
                recipient_chain,
                chains_data,
              )

              const deposit_address_chain_data = getChain(
                deposit_address_chain,
                chains_data,
              )

              symbol = contracts?.find(c => c?.chain_id === chain_data?.chain_id)?.symbol ||
                ibc?.find(i => i?.chain_id === chain_data?.id)?.symbol ||
                symbol

              image = contracts?.find(c => c?.chain_id === chain_data?.chain_id)?.image ||
                ibc?.find(i => i?.chain_id === chain_data?.id)?.image ||
                image

              return (
                <div
                  key={i}
                  className="w-fit bg-slate-100 dark:bg-slate-900 bg-opacity-75 shadow dark:shadow-slate-600 rounded-lg space-y-3 py-3.5 px-4"
                >
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center space-y-3 sm:space-y-0">
                    {sender && (
                      <div className="space-y-1 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center">
                          <div className="mr-1.5">
                            {sender_chain_data ?
                              <a
                                href={`${sender_chain_data.explorer?.url}${sender_chain_data.explorer?.address_path?.replace('{address}', sender)}`}
                                target="_blank"
                                rel="noopenner noreferrer"
                                className="text-blue-500 dark:text-white font-bold"
                              >
                                {ellipse(
                                  sender,
                                  16,
                                  sender_chain_data.prefix_address,
                                )}
                              </a> :
                              <span className="font-semibold">
                                {ellipse(
                                  sender,
                                  16,
                                )}
                              </span>
                            }
                          </div>
                          <Copy
                            value={sender}
                            size={20}
                          />
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          {signer ?
                            'Signer' :
                            'Sender'
                          }
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col items-center space-y-1.5 my-2 mr-4 sm:mr-6">
                      {source_channel && destination_channel && (
                        <div className="flex items-center text-slate-500 dark:text-slate-300 space-x-1">
                          <span className="text-xs font-medium">
                            {source_channel}
                          </span>
                          <BiRightArrowAlt />
                          <span className="text-xs font-medium">
                            {destination_channel}
                          </span>
                        </div>
                      )}
                      <div className="bg-blue-600 bg-opacity-75 rounded text-white text-xs font-bold py-1 px-1.5">
                        {name(
                          activities.length > 1 ?
                            a?.type :
                            type
                        )}
                      </div>
                      {status && (
                        <div className="text-center">
                          <div className={`${['STATUS_COMPLETED'].includes(status) ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-slate-400 dark:text-slate-500'} text-xs`}>
                            {status.replace('STATUS_', '')}
                          </div>
                          <div className="text-xs font-bold">
                            Status
                          </div>
                        </div>
                      )}
                      {(amount || symbol) && (
                        <div className="flex items-center space-x-1">
                          {image && (
                            <Image
                              src={image}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                          )}
                          {amount && (
                            <span className="font-semibold">
                              {number_format(
                                amount,
                                '0,0.000000'
                              )}
                            </span>
                          )}
                          {symbol && (
                            <span className="font-semibold">
                              {symbol}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {recipient && (
                      <div className="space-y-1 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center">
                          <div className="mr-1.5">
                            {recipient_chain_data ?
                              <a
                                href={`${recipient_chain_data.explorer?.url}${recipient_chain_data.explorer?.address_path?.replace('{address}', recipient)}`}
                                target="_blank"
                                rel="noopenner noreferrer"
                                className="text-blue-500 dark:text-white font-bold"
                              >
                                {ellipse(
                                  recipient,
                                  16,
                                  recipient_chain_data.prefix_address,
                                )}
                              </a> :
                              <span className="font-semibold">
                                {ellipse(
                                  recipient,
                                  16,
                                )}
                              </span>
                            }
                          </div>
                          <Copy
                            value={recipient}
                            size={20}
                          />
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Recipient
                        </div>
                      </div>
                    )}
                    {chain && (
                      <div className="space-y-0 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center space-x-2">
                          {chain_data?.image && (
                            <Image
                              src={chain_data?.image}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                          )}
                          <div className="text-base font-bold">
                            {chain_data?.name || chain}
                          </div>
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Chain
                        </div>
                      </div>
                    )}
                    {deposit_address && (
                      <div className="space-y-1 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center">
                          <div className="mr-1.5">
                            {deposit_address_chain_data ?
                              <a
                                href={`${deposit_address_chain_data.explorer?.url}${deposit_address_chain_data.explorer?.address_path?.replace('{address}', deposit_address)}`}
                                target="_blank"
                                rel="noopenner noreferrer"
                                className="text-blue-500 dark:text-white font-bold"
                              >
                                {ellipse(
                                  deposit_address,
                                  16,
                                  deposit_address_chain_data.prefix_address,
                                )}
                              </a> :
                              <span className="font-semibold">
                                {ellipse(
                                  deposit_address,
                                  16,
                                )}
                              </span>
                            }
                          </div>
                          <Copy
                            value={deposit_address}
                            size={20}
                          />
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Deposit address
                        </div>
                      </div>
                    )}
                    {burner_address && (
                      <div className="space-y-1 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center">
                          <div className="mr-1.5">
                            {chain_data ?
                              <a
                                href={`${chain_data.explorer?.url}${chain_data.explorer?.address_path?.replace('{address}', burner_address)}`}
                                target="_blank"
                                rel="noopenner noreferrer"
                                className="text-blue-500 dark:text-white font-bold"
                              >
                                {ellipse(
                                  burner_address,
                                  16,
                                  chain_data.prefix_address,
                                )}
                              </a> :
                              <span className="font-semibold">
                                {ellipse(
                                  burner_address,
                                  16,
                                )}
                              </span>
                            }
                          </div>
                          <Copy
                            value={burner_address}
                            size={20}
                          />
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Burner address
                        </div>
                      </div>
                    )}
                    {tx_id && (
                      <div className="space-y-1 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center">
                          <div className="mr-1.5">
                            {chain_data ?
                              <a
                                href={`${chain_data.explorer?.url}${chain_data.explorer?.transaction_path?.replace('{tx}', tx_id)}`}
                                target="_blank"
                                rel="noopenner noreferrer"
                                className="text-blue-500 dark:text-white font-bold"
                              >
                                {ellipse(
                                  tx_id,
                                  16,
                                )}
                              </a> :
                              <span className="font-semibold">
                                {ellipse(
                                  tx_id,
                                  16,
                                )}
                              </span>
                            }
                          </div>
                          <Copy
                            value={tx_id}
                            size={20}
                          />
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Transaction
                        </div>
                      </div>
                    )}
                    {poll_id && (
                      <div className="space-y-0.5 my-2 mr-4 sm:mr-6">
                        <div className="flex items-center">
                          <div className="mr-1.5">
                            <span className="text-base font-bold">
                              {poll_id}
                            </span>
                          </div>
                          <Copy
                            value={poll_id}
                            size={20}
                          />
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Poll ID
                        </div>
                      </div>
                    )}
                    {acknowledgement && (
                      <div className="space-y-0.5 my-2 mr-4 sm:mr-6">
                        <div className="text-slate-400 dark:text-slate-200">
                          {decode_base64(acknowledgement)}
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Acknowledgement
                        </div>
                      </div>
                    )}
                    {timeout_timestamp && (
                      <div className="space-y-0.5 my-2 mr-4 sm:mr-6">
                        <div className="text-slate-400 dark:text-slate-200">
                          {moment(timeout_timestamp).format('D MMM YYYY HH:mm:ss A')}
                        </div>
                        <div className="dark:text-slate-200 font-bold dark:font-semibold">
                          Timeout
                        </div>
                      </div>
                    )}
                  </div>
                  {events?.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <div className="text-base font-bold">
                        Events
                      </div>
                      {events.map((e, j) => {
                        const {
                          event,
                        } = { ...e }

                        return (
                          <div
                            key={j}
                            className="w-fit bg-zinc-200 dark:bg-zinc-800 bg-opacity-50 rounded-xl space-y-2 py-5 px-4"
                          >
                            {event && (
                              <div className="w-fit bg-green-600 bg-opacity-75 rounded text-white text-xs font-bold py-1 px-1.5">
                                {name(event)}
                              </div>
                            )}
                            {Object.entries({ ...e })
                              .filter(([k, v]) => !['event'].includes(k))
                              .map(([k, v]) => (
                                <div
                                  key={k}
                                  className="flex items-start space-x-4"
                                >
                                  <span className="w-48 text-slate-400 dark:text-slate-300">
                                    {k}
                                  </span>
                                  <div className="flex items-start space-x-1.5">
                                    <span className="max-w-xl break-all font-bold">
                                      {typeof v === 'string' ?
                                        ellipse(
                                          v,
                                          256,
                                        ) :
                                        typeof v === 'object' && v ?
                                          <pre className="bg-zinc-100 dark:bg-zinc-900 rounded-lg text-xs font-medium text-left">
                                            {JSON.stringify(v, null, 2)}
                                          </pre> :
                                        v?.toString()
                                      }
                                    </span>
                                    {v && (
                                      <div className="mt-0.5">
                                        <Copy
                                          value={typeof v === 'object' ?
                                            JSON.stringify(v) :
                                            v
                                          }
                                          size={18}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            }
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {packet && (
                    <div className="space-y-2 mt-4">
                      <div
                        className="w-fit bg-zinc-200 dark:bg-zinc-800 bg-opacity-50 rounded-xl space-y-2 py-5 px-4"
                      >
                        <div className="w-fit bg-green-600 bg-opacity-75 rounded text-white text-xs font-bold py-1 px-1.5">
                          Packet
                        </div>
                        {Object.entries({ ...packet })
                          .filter(([k, v]) => ![].includes(k))
                          .map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-start space-x-4"
                            >
                              <span className="w-48 text-slate-400 dark:text-slate-300">
                                {k}
                              </span>
                              <div className="flex items-start space-x-1.5">
                                <span className="max-w-xl break-all font-bold">
                                  {typeof v === 'string' ?
                                    ellipse(
                                      v,
                                      256,
                                    ) :
                                    typeof v === 'object' && v ?
                                      <pre className="bg-zinc-100 dark:bg-zinc-900 rounded-lg text-xs font-medium text-left">
                                        {JSON.stringify(v, null, 2)}
                                      </pre> :
                                    v?.toString()
                                  }
                                </span>
                                {v && (
                                  <div className="mt-0.5">
                                    <Copy
                                      value={typeof v === 'object' ?
                                        JSON.stringify(v) :
                                        v
                                      }
                                      size={18}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div> :
          tx &&
          (
            <div className="text-sm lg:text-base font-medium">
              {to_json(
                messages ||
                tx
              ) ?
                <ReactJson
                  src={to_json(
                    messages ||
                    tx
                  )}
                  theme={json_theme(theme)}
                  style={{
                    borderRadius: '.75rem',
                    padding: '.8rem .75rem',
                  }}
                /> :
                <span>
                  {
                    messages ||
                    tx
                  }
                </span>
              }
            </div>
          )
        }
      </div>
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <div className="text-lg font-bold">
            Events
          </div>
          {logsFormattable && (
            <div className="w-fit bg-slate-100 dark:bg-zinc-900 rounded-xl flex flex-wrap item-center space-x-1 p-1">
              {FORMATS.map((f, i) => {
                const {
                  id,
                  name,
                } = { ...f }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLogsFormat(id)}
                    className={`${id === logsFormat ? 'bg-white dark:bg-black shadow dark:shadow-zinc-800 text-black dark:text-white font-semibold' : 'bg-transparent text-slate-400 dark:text-slate-600 hover:text-slate-800 dark:hover:text-slate-200 font-normal hover:font-medium'} rounded-lg py-1 px-2`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {logsFormat === 'formatted' && logsFormattable ?
          <div className="space-y-3">
            {to_json(raw_log).map((l, i) => {
              const {
                log,
                events,
              } = { ...l }

              return (
                <div
                  key={i}
                  className="w-fit bg-slate-100 dark:bg-slate-900 bg-opacity-75 shadow dark:shadow-slate-600 rounded-lg space-y-3 py-3.5 px-4"
                >
                  <div className="space-y-2">
                    {log && (
                      <div className="text-base font-semibold">
                        {log}
                      </div>
                    )}
                    {_.reverse(events)
                      .filter(e => e?.attributes?.length > 0)
                      .map(e => {
                        const {
                          type,
                          attributes,
                        } = { ...e }

                        return {
                          type,
                          attributes: attributes
                            .filter(a => a)
                            .map(a =>
                              [
                                a.key,
                                a.value,
                              ]
                            )
                        }
                      })
                      .map((e, j) => {
                        const {
                          type,
                          attributes,
                        } = { ...e }

                        return (
                          <div
                            key={j}
                            className="w-fit bg-zinc-200 dark:bg-zinc-800 bg-opacity-50 rounded-xl space-y-2 py-5 px-4"
                          >
                            {type && (
                              <div className="w-fit bg-green-600 bg-opacity-75 rounded text-white text-xs font-bold py-1 px-1.5">
                                {name(type)}
                              </div>
                            )}
                            {attributes
                              .map(([k, v]) => (
                                <div
                                  key={k}
                                  className="flex items-start space-x-4"
                                >
                                  <span className="w-48 text-slate-400 dark:text-slate-300">
                                    {k}
                                  </span>
                                  <div className="flex items-start space-x-1.5">
                                    <span className="max-w-xl break-all font-bold">
                                      {typeof v === 'string' ?
                                        ellipse(
                                          v,
                                          256,
                                        ) :
                                        typeof v === 'object' && v ?
                                          <pre className="bg-zinc-100 dark:bg-zinc-900 rounded-lg text-xs font-medium text-left">
                                            {JSON.stringify(v, null, 2)}
                                          </pre> :
                                        v?.toString()
                                      }
                                    </span>
                                    {v && (
                                      <div className="mt-0.5">
                                        <Copy
                                          value={typeof v === 'object' ?
                                            JSON.stringify(v) :
                                            v
                                          }
                                          size={18}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            }
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
              )
            })}
          </div> :
          raw_log &&
          (
            <div className="text-sm lg:text-base font-medium">
              {to_json(raw_log) ?
                <ReactJson
                  src={to_json(raw_log)}
                  theme={json_theme(theme)}
                  style={{
                    borderRadius: '.75rem',
                    padding: '.8rem .75rem',
                  }}
                /> :
                <span>
                  {raw_log}
                </span>
              }
            </div>
          )
        }
      </div>
    </div>
  )
}