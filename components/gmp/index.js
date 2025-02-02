import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, shallowEqual } from 'react-redux'
import _ from 'lodash'
import moment from 'moment'
import Web3 from 'web3'
import { BigNumber, Contract, FixedNumber, constants, providers, utils } from 'ethers'
import { AxelarGMPRecoveryAPI } from '@axelar-network/axelarjs-sdk'
import { ProgressBar, TailSpin, Watch, ColorRing } from 'react-loader-spinner'
import { Tooltip } from '@material-tailwind/react'
import { BiCheckCircle, BiXCircle, BiTime, BiSave, BiEditAlt } from 'react-icons/bi'
import { MdRefresh } from 'react-icons/md'
import { HiArrowSmRight, HiArrowSmLeft } from 'react-icons/hi'
import { FiCircle } from 'react-icons/fi'
import { TiArrowRight } from 'react-icons/ti'
import { RiCloseCircleFill, RiTimerFlashLine } from 'react-icons/ri'

import EnsProfile from '../ens-profile'
import AccountProfile from '../account-profile'
import Image from '../image'
import Copy from '../copy'
import Notification from '../notifications'
import Wallet from '../wallet'
import { getChain } from '../../lib/object/chain'
import { number_format, capitalize, ellipse, equals_ignore_case, total_time_string, loader_color, sleep } from '../../lib/utils'
import IAxelarExecutable from '../../data/contracts/interfaces/IAxelarExecutable.json'

export default () => {
  const {
    preferences,
    evm_chains,
    cosmos_chains,
    assets,
    wallet,
  } = useSelector(state =>
    (
      {
        preferences: state.preferences,
        evm_chains: state.evm_chains,
        cosmos_chains: state.cosmos_chains,
        assets: state.assets,
        wallet: state.wallet,
      },
    ),
    shallowEqual,
  )
  const {
    theme,
  } = { ...preferences }
  const {
    evm_chains_data,
  } = { ...evm_chains }
  const {
    cosmos_chains_data,
  } = { ...cosmos_chains }
  const {
    assets_data,
  } = { ...assets }
  const {
    wallet_data,
  } = { ...wallet }
  const {
    default_chain_id,
    chain_id,
    provider,
    web3_provider,
    address,
    signer,
  } = { ...wallet_data }

  const router = useRouter()
  const {
    query,
  } = { ...router }
  const {
    tx,
    edit,
  } = { ...query }

  const [api, setApi] = useState(null)
  const [gmp, setGmp] = useState(null)
  const [approving, setApproving] = useState(null)
  const [approveResponse, setApproveResponse] = useState(null)
  const [executing, setExecuting] = useState(null)
  const [executeResponse, setExecuteResponse] = useState(null)
  const [gasAdding, setGasAdding] = useState(null)
  const [gasAddResponse, setGasAddResponse] = useState(null)
  const [refunding, setRefunding] = useState(null)
  const [refundResponse, setRefundResponse] = useState(null)
  const [txHashEdit, setTxHashEdit] = useState(null)
  const [txHashEditing, setTxHashEditing] = useState(false)
  const [txHashEditUpdating, setTxHashEditUpdating] = useState(false)
  const [txHashRefundEdit, setTxHashRefundEdit] = useState(null)
  const [txHashRefundEditing, setTxHashRefundEditing] = useState(false)
  const [txHashRefundEditUpdating, setTxHashRefundEditUpdating] = useState(false)

  useEffect(
    () => {
      if (!api) {
        setApi(
          new AxelarGMPRecoveryAPI(
            {
              environment: process.env.NEXT_PUBLIC_ENVIRONMENT,
              axelarRpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
              axelarLcdUrl: process.env.NEXT_PUBLIC_LCD_URL,
            },
          )
        )
      }
    },
    [],
  )

  const getMessage = async () => {
    if (
      evm_chains_data &&
      tx &&
      api
    ) {
      if (gmp) {
        await sleep(2 * 1000)

        if (gmp.tx !== tx) {
          setGmp(null)
          resetTxHashEdit()
        }
      }

      const response =
        await api.execGet(
          process.env.NEXT_PUBLIC_GMP_API_URL,
          {
            method: 'searchGMP',
            txHash: tx,
          }
        )

      const data = _.head(response)

      const {
        approved,
      } = { ...data }

      // callback data of 2-way call (if exists)
      let {
        callback,
      } = { ...data }

      if (callback?.transactionHash) {
        const _response =
          await api.execGet(
            process.env.NEXT_PUBLIC_GMP_API_URL,
            {
              method: 'searchGMP',
              txHash: callback.transactionHash,
              txIndex: callback.transactionIndex,
              txLogIndex: callback.logIndex,
            },
          )

        callback = (_response || [])
          .find(d =>
            equals_ignore_case(
              d?.call?.transactionHash,
              callback.transactionHash,
            )
          )
      }

      // origin data of 2-way call (query on 2nd call only)
      let origin

      const {
        call,
        gas_paid,
        gas_paid_to_callback,
        is_call_from_relayer,
      } = { ...data }

      if (
        call &&
        !gas_paid &&
        (
          gas_paid_to_callback ||
          is_call_from_relayer
        )
      ) {
        const _response =
          await api.execGet(
            process.env.NEXT_PUBLIC_GMP_API_URL,
            {
              method: 'searchGMP',
              txHash: call.transactionHash,
            },
          )

        origin = (_response || [])
          .find(d =>
            equals_ignore_case(
              d?.executed?.transactionHash,
              call.transactionHash,
            )
          )
      }

      let execute_data

      if (approved) {
        const {
          destinationChain,
          payload,
        } = { ...data.call?.returnValues }
        const {
          contractAddress,
          commandId,
          sourceChain,
          sourceAddress,
          symbol,
          amount,
        } = { ...approved.returnValues }

        // setup provider
        const chain_data =
          getChain(
            destinationChain,
            evm_chains_data,
          )

        const {
          chain_id,
          provider_params,
        } = { ...chain_data }

        const {
          rpcUrls,
        } = {
          ...(
            _.head(
              provider_params
            )
          ),
        }

        const rpcs =
          rpcUrls ||
          []

        const provider =
          rpcs.length === 1 ?
            new providers.StaticJsonRpcProvider(
              _.head(rpcs),
              chain_id,
            ) :
            new providers.FallbackProvider(
              rpcs
                .map((url, i) => {
                  return {
                    provider:
                      new providers.StaticJsonRpcProvider(
                        url,
                        chain_id,
                      ),
                    priority: i + 1,
                    stallTimeout: 1000,
                  }
                }),
              rpcs.length / 3,
            )

        const executable_contract =
          new Contract(
            contractAddress,
            IAxelarExecutable.abi,
            provider,
          )

        let _response

        const method =
          `execute${
            symbol ?
              'WithToken' :
              ''
          }`

        switch (method) {
          case 'execute':
            _response =
              await executable_contract.populateTransaction
                .execute(
                  commandId,
                  sourceChain,
                  sourceAddress,
                  payload,
                )
            break
          case 'executeWithToken':
            _response =
              await executable_contract.populateTransaction
                .executeWithToken(
                  commandId,
                  sourceChain,
                  sourceAddress,
                  payload,
                  symbol,
                  BigNumber.from(
                    amount
                  ),
                )
            break
          default:
            break
        }

        if (_response?.data) {
          execute_data = _response.data
        }
      }

      setGmp(
        {
          data,
          execute_data,
          callback,
          origin,
          tx,
        }
      )
    }
  }

  useEffect(
    () => {
      const getData = () =>
        getMessage()

      if (
        !approving &&
        !executing &&
        !txHashEditing &&
        !txHashRefundEditing
      ) {
        getData()
      }

      const interval =
        setInterval(() =>
          getData(),
          0.15 * 60 * 1000,
        )

      return () => clearInterval(interval)
    },
    [evm_chains_data, tx, api, approving, executing, txHashEditing, txHashRefundEditing],
  )

  const resetTxHashEdit = () => {
    setApproveResponse(null)
    setExecuteResponse(null)
    setGasAddResponse(null)
    setRefundResponse(null)
    setTxHashEdit(null)
    setTxHashEditing(false)
    setTxHashEditUpdating(false)
    setTxHashRefundEdit(null)
    setTxHashRefundEditing(false)
    setTxHashRefundEditUpdating(false)
  }

  const saveGMP = async (
    sourceTransactionHash,
    sourceTransactionIndex,
    sourceTransactionLogIndex,
    transactionHash,
    relayerAddress,
    error,
    event,
  ) => {
    const params = {
      method: 'saveGMP',
      sourceTransactionHash,
      sourceTransactionIndex,
      sourceTransactionLogIndex,
      transactionHash,
      relayerAddress,
      error,
      event,
    }

    // request api
    await fetch(
      process.env.NEXT_PUBLIC_GMP_API_URL,
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
    )
    .catch(error => {
      return null
    })

    getMessage()
    resetTxHashEdit()
  }

  const approve = async data => {
    if (
      api &&
      data
    ) {
      try {
        setApproving(true)
        setApproveResponse(
          {
            status: 'pending',
            message: 'Approving',
          }
        )

        const {
          call,
        } = { ...data }
        const {
          transactionHash,
          transactionIndex,
          logIndex,
        } = { ...call }

        console.log(
          '[approve request]',
          {
            transactionHash,
          },
        )

        const response =
          await api.manualRelayToDestChain(
            transactionHash,
          )

        console.log(
          '[approve response]',
          response,
        )

        const {
          success,
          error,
          signCommandTx,
        } = { ...response }

        if (success) {
          await sleep(15 * 1000)
        }

        setApproving(false)
        setApproveResponse(
          {
            status:
              success ?
                'success' :
                'failed',
            message:
              error?.message ||
              error ||
              'Approve successful',
            txHash: signCommandTx?.txhash,
            is_axelar_transaction: true,
          }
        )
      } catch (error) {
        const message =
          error?.reason ||
          error?.data?.message ||
          error?.data?.text ||
          error?.message

        setApproving(false)
        setApproveResponse(
          {
            status: 'failed',
            message,
          }
        )
      }
    }
  }

  const execute = async data => {
    if (
      api &&
      signer &&
      data
    ) {
      try {
        setExecuting(true)
        setExecuteResponse(
          {
            status: 'pending',
            message: 'Executing',
          }
        )

        const {
          call,
        } = { ...data }
        const {
          transactionHash,
          transactionIndex,
          logIndex,
        } = { ...call }

        console.log(
          '[execute request]',
          {
            transactionHash,
            logIndex,
          },
        )

        const response =
          await api.execute(
            transactionHash,
            logIndex,
          )

        console.log(
          '[execute response]',
          response,
        )

        const {
          success,
          error,
          transaction,
        } = { ...response }

        setExecuting(false)
        setExecuteResponse(
          {
            status:
              success &&
              transaction ?
                'success' :
                'failed',
            message:
              error?.message ||
              error ||
              (
                transaction ?
                  'Execute successful' :
                  'Error Execution. Please see the error on console.'
              ),
            txHash: transaction?.transactionHash,
          }
        )
      } catch (error) {
        const message =
          error?.reason ||
          error?.data?.message ||
          error?.data?.text ||
          error?.message

        setExecuting(false)
        setExecuteResponse(
          {
            status: 'failed',
            message,
          }
        )
      }
    }
  }

  const addNativeGas = async data => {
    if (
      api &&
      signer &&
      data
    ) {
      try {
        setGasAdding(true)
        setGasAddResponse(
          {
            status: 'pending',
            message: 'Estimating & Paying gas',
          }
        )

        const {
          call,
          approved,
        } = { ...data }
        const {
          chain,
          transactionHash,
          transactionIndex,
          logIndex,
        } = { ...call }

        console.log(
          '[addNativeGas request]',
          {
            chain,
            transactionHash,
            refundAddress: address,
          },
        )

        const response =
          await api.addNativeGas(
            chain,
            transactionHash,
            {
              refundAddress: address,
            },
          )

        console.log(
          '[addNativeGas response]',
          response,
        )

        const {
          success,
          error,
          transaction,
        } = { ...response }

        if (success) {
          await sleep(15 * 1000)
        }

        setGasAdding(false)
        setGasAddResponse(
          {
            status:
              success ?
                'success' :
                'failed',
            message:
              error?.message ||
              error ||
              'Pay gas successful',
            txHash: transaction?.transactionHash,
          }
        )

        if (
          success &&
          !approved
        ) {
          await sleep(1 * 1000)

          approve(data)
        }
      } catch (error) {
        const message =
          error?.reason ||
          error?.data?.message ||
          error?.data?.text ||
          error?.message

        setGasAdding(false)
        setGasAddResponse(
          {
            status: 'failed',
            message,
          }
        )
      }
    }
  }

  const refund = async data => {
    if (
      api &&
      data
    ) {
      try {
        setRefunding(true)
        setRefundResponse(
          {
            status: 'pending',
            message: 'Refunding',
          }
        )

        const {
          call,
        } = { ...data }
        const {
          transactionHash,
          transactionIndex,
          logIndex,
        } = { ...call }

        const params =
          {
            method: 'saveGMP',
            sourceTransactionHash: transactionHash,
            sourceTransactionIndex: transactionIndex,
            sourceTransactionLogIndex: logIndex,
            event: 'to_refund',
          }

        console.log(
          '[refund request]',
          {
            ...params,
          },
        )

        const _response =
          await api.execPost(
            process.env.NEXT_PUBLIC_GMP_API_URL,
            '',
            params,
          )

        console.log(
          '[refund response]',
          _response,
        )

        const {
          response,
        } = { ..._response }
        const {
          result,
        } = { ...response }

        const success =
          result === 'updated' ||
          _response?.event === 'to_refund'

        if (success) {
          await sleep(15 * 1000)
        }

        setRefunding(false)
        setRefundResponse(
          {
            status:
              success ?
                'success' :
                'failed',
            message:
              success ?
                'Start refund process successful' :
                'Cannot start refund process',
          }
        )
      } catch (error) {
        const message =
          error?.reason ||
          error?.data?.message ||
          error?.data?.text ||
          error?.message

        setRefunding(false)
        setRefundResponse(
          {
            status: 'failed',
            message,
          }
        )
      }
    }
  }

  const {
    data,
    execute_data,
    callback,
    origin,
  } = { ...gmp }
  const {
    call,
    gas_paid,
    gas_paid_to_callback,
    forecalled,
    approved,
    executed,
    is_executed,
    error,
    refunded,
    fees,
    status,
    gas,
    is_invalid_destination_chain,
    is_invalid_call,
    is_insufficient_minimum_amount,
    is_insufficient_fee,
    is_call_from_relayer,
  } = { ...data }
  let {
    is_not_enough_gas,
    no_gas_remain,
  } = { ...data }
  const {
    event,
    chain,
  } = { ...call }
  const {
    sender,
    destinationChain,
    destinationContractAddress,
    payloadHash,
    payload,
    symbol,
    amount,
  } = { ...call?.returnValues }
  const {
    commandId,
    sourceChain,
  } = { ...approved?.returnValues }
  const {
    from,
  } = { ...call?.transaction }

  const relayer = executed?.transaction?.from

  is_not_enough_gas =
    is_not_enough_gas ||
    (
      error?.transaction?.gasLimit &&
      error.receipt?.gasUsed ?
        Number(
          FixedNumber.fromString(
            BigNumber.from(
              error.receipt.gasUsed
            )
            .toString()
          )
          .divUnsafe(
            FixedNumber.fromString(
              BigNumber.from(
                error.transaction.gasLimit
              )
              .toString()
            )
          )
          .toString()
        ) > 0.95 :
        is_not_enough_gas
    )

  no_gas_remain =
    gas?.gas_remain_amount < 0.001 ||
    (
      typeof no_gas_remain === 'boolean' ?
        no_gas_remain :
        refunded &&
        !refunded.receipt?.status
    )

  const chains_data =
    _.concat(
      evm_chains_data,
      cosmos_chains_data,
    )

  const source_chain_data =
    getChain(
      chain,
      chains_data,
    )

  const axelar_chain_data =
    getChain(
      'axelarnet',
      chains_data,
    )

  const destination_chain_data =
    getChain(
      destinationChain,
      chains_data,
    )

  const asset_data = (assets_data || [])
    .find(a =>
      equals_ignore_case(
        a?.symbol,
        symbol,
      ) ||
      (a?.contracts || [])
        .findIndex(c =>
          c?.chain_id === source_chain_data?.chain_id &&
          equals_ignore_case(
            c.symbol,
            symbol,
          )
        ) > -1 ||
      (a?.contracts || [])
        .findIndex(c =>
          equals_ignore_case(
            c.symbol,
            symbol,
          )
        ) > -1 ||
      (a?.ibc || [])
        .findIndex(c =>
          equals_ignore_case(
            c.symbol,
            symbol,
          )
        ) > -1
    )

  const source_contract_data = (asset_data?.contracts || [])
    .find(c =>
      c.chain_id === source_chain_data?.chain_id
    )

  const decimals =
    source_contract_data?.decimals ||
    asset_data?.decimals ||
    18

  const _symbol =
    source_contract_data?.symbol ||
    asset_data?.symbol ||
    symbol

  const asset_image =
    source_contract_data?.image ||
    asset_data?.image

  const wrong_source_chain =
    source_chain_data &&
    chain_id !== source_chain_data.chain_id &&
    !gasAdding

  const wrong_destination_chain =
    destination_chain_data &&
    chain_id !== destination_chain_data.chain_id &&
    !executing

  const staging = process.env.NEXT_PUBLIC_SITE_URL?.includes('staging')

  const editable =
    (
      edit === 'true' &&
      (
        staging ||
        ![
          'mainnet',
        ].includes(process.env.NEXT_PUBLIC_ENVIRONMENT)
      )
    )

  const approveButton =
    call &&
    !approved &&
    !executed &&
    !is_executed &&
    !(
      is_invalid_destination_chain ||
      is_invalid_call ||
      is_insufficient_minimum_amount ||
      is_insufficient_fee ||
      gas?.gas_remain_amount < 0.00001
    ) &&
    moment()
      .diff(
        moment(
          call.block_timestamp * 1000
        ),
        'minutes',
      ) >= (
        [
          'ethereum',
        ]
        .includes(chain) ?
          process.env.NEXT_PUBLIC_ENVIRONMENT === 'mainnet' ?
            15 :
            20 :
          [
            'polygon',
          ]
          .includes(chain) ?
            process.env.NEXT_PUBLIC_ENVIRONMENT === 'mainnet' ?
              7 :
              15 :
            3
      ) &&
    (
      <div className="flex items-center space-x-2">
        <button
          disabled={approving}
          onClick={() =>
            approve(data)
          }
          className={`bg-blue-500 hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400 ${approving ? 'pointer-events-none' : ''} rounded flex items-center text-white space-x-1.5 py-1 px-2`}
        >
          {
            approving &&
            (
              <TailSpin
                width="16"
                height="16"
                color="white"
              />
            )
          }
          <span>
            Approve
          </span>
        </button>
      </div>
    )

  const executeButton =
    payload &&
    approved &&
    !executed &&
    !is_executed &&
    (
      error ||
      moment()
        .diff(
          moment(
            approved.block_timestamp * 1000
          ),
          'minutes',
        ) >= 2
    ) &&
    (
      <>
        <span className="whitespace-nowrap text-slate-400 dark:text-slate-200 text-xs pt-1">
          Execute at destination chain
        </span>
        <div className="flex items-center space-x-2">
          {
            web3_provider &&
            !wrong_destination_chain &&
            (
              <button
                disabled={executing}
                onClick={() =>
                  execute(data)
                }
                className={`bg-blue-500 hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400 ${executing ? 'pointer-events-none' : ''} rounded flex items-center text-white space-x-1.5 py-1 px-2`}
              >
                {
                  executing &&
                  (
                    <TailSpin
                      width="16"
                      height="16"
                      color="white"
                    />
                  )
                }
                <span>
                  Execute
                </span>
              </button>
            )
          }
          <Wallet
            connectChainId={
              wrong_destination_chain &&
              (
                destination_chain_data.chain_id ||
                default_chain_id
              )
            }
          />
        </div>
      </>
    )

  const gasAddButton =
    !executed &&
    !is_executed &&
    (
      is_not_enough_gas ||
      !(
        gas_paid ||
        gas_paid_to_callback
      ) ||
      is_insufficient_fee ||
      gas?.gas_remain_amount < 0.00001
    ) &&
    (
      <>
        <span className="whitespace-nowrap text-slate-400 dark:text-slate-200 text-xs">
          Add gas at source chain
        </span>
        <div className="flex items-center space-x-2">
          {
            web3_provider &&
            !wrong_source_chain &&
            (
              <button
                disabled={gasAdding}
                onClick={() =>
                  addNativeGas(data)
                }
                className={`bg-blue-500 hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400 ${gasAdding ? 'pointer-events-none' : ''} rounded flex items-center text-white space-x-1.5 py-1 px-2`}
              >
                {
                  gasAdding &&
                  (
                    <TailSpin
                      width="16"
                      height="16"
                      color="white"
                    />
                  )
                }
                <span className="whitespace-nowrap">
                  Add gas
                </span>
              </button>
            )
          }
          <Wallet
            connectChainId={
              wrong_source_chain &&
              (
                source_chain_data.chain_id ||
                default_chain_id
              )
            }
          />
        </div>
      </>
    )

  const refundButton =
    !approveButton &&
    !executeButton &&
    !no_gas_remain &&
    (
      executed ||
      error ||
      is_executed ||
      is_invalid_destination_chain ||
      is_invalid_call ||
      is_insufficient_minimum_amount ||
      is_insufficient_fee
    ) &&
    (
      approved?.block_timestamp <
      moment()
        .subtract(
          3,
          'minutes',
        )
        .unix() ||
      is_invalid_destination_chain ||
      is_invalid_call ||
      is_insufficient_minimum_amount ||
      is_insufficient_fee
    ) &&
    (
      editable ||
      (
        (
          (
            gas?.gas_remain_amount >= 0.0001 &&
            (
              gas.gas_remain_amount / gas.gas_paid_amount > 0.1 ||
              gas.gas_remain_amount * fees?.source_token?.token_price?.usd > 1
            )
          ) ||
          (
            gas?.gas_remain_amount >= 0.0001 &&
            gas?.gas_paid_amount < gas?.gas_base_fee_amount &&
            gas.gas_paid_amount * fees?.source_token?.token_price?.usd > 1 &&
            is_insufficient_fee
          )
        ) &&
        (
          !refunded ||
          refunded.error ||
          refunded.block_timestamp < gas_paid?.block_timestamp
        )
      )
    ) &&
    (
      <div className="flex items-center space-x-2">
        <button
          disabled={refunding}
          onClick={() =>
            refund(data)
          }
          className={`bg-blue-500 hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400 ${refunding ? 'pointer-events-none' : ''} rounded flex items-center text-white space-x-1.5 py-1 px-2`}
        >
          {
            refunding &&
            (
              <TailSpin
                width="16"
                height="16"
                color="white"
              />
            )
          }
          <span>
            Refund
          </span>
        </button>
      </div>
    )

  const steps =
    [
      {
        id: 'call',
        title:
          staging ?
            'Called' :
            'Contract Call',
        chain_data: source_chain_data,
        data: call,
      },
      {
        id: 'gas_paid',
        title: 'Gas Paid',
        chain_data: source_chain_data,
        data: gas_paid,
      },
      forecalled &&
      {
        id: 'forecalled',
        title: 'Express Execute',
        chain_data: destination_chain_data,
        data: forecalled,
      },
      {
        id: 'approved',
        title:
          staging ?
            'Approved' :
            'Call Approved',
        chain_data: destination_chain_data,
        data: approved,
      },
      {
        id: 'executed',
        title: 'Executed',
        chain_data: destination_chain_data,
        data: executed,
      },
      refunded &&
      (
        (
          refunded.receipt &&
          refunded.receipt?.status
        ) ||
        no_gas_remain === false
      ) &&
      {
        id: 'refunded',
        title: 'Gas Refunded',
        chain_data: source_chain_data,
        data: refunded,
      },
    ]
    .filter(s => s)

  let current_step

  switch (status) {
    case 'called':
      current_step =
        steps
          .findIndex(s =>
            s.id ===
              (
                gas_paid ||
                gas_paid_to_callback ?
                  'gas_paid' :
                  'call'
              )
          ) + 
        (
          !is_invalid_destination_chain &&
          !is_invalid_call &&
          !is_insufficient_minimum_amount &&
          !is_insufficient_fee &&
          (
            gas_paid ||
            gas_paid_to_callback ||
            equals_ignore_case(
              call?.transactionHash,
              gas_paid?.transactionHash,
            )
          ) ?
            1 :
            0
        )
      break
    case 'forecalled':
      current_step =
        steps
          .findIndex(s =>
            s.id === 'forecalled'
          ) +
        1
      break
    case 'approved':
    case 'executing':
      current_step =
        steps
          .findIndex(s =>
            s.id === (
              gas_paid ||
              gas_paid_to_callback ?
                'approved' :
                'call'
            )
          ) +
        1
      break
    case 'executed':
    case 'error':
      current_step =
        steps
          .findIndex(s =>
            s.id === 'executed'
          ) +
        (
          executed ||
          (
            error &&
            (
              error?.block_timestamp ||
              approved?.block_timestamp
            ) &&
            moment()
              .diff(
                moment(
                  (
                    error?.block_timestamp ||
                    approved.block_timestamp
                  ) * 1000
                ),
                'seconds',
              ) >= 240
          ) ?
            1 :
            0
        )
      break
    default:
      break
  }

  const detail_steps = steps

  const forecall_time_spent =
    total_time_string(
      call?.block_timestamp,
      forecalled?.block_timestamp,
    )

  const time_spent =
    total_time_string(
      call?.block_timestamp,
      executed?.block_timestamp,
    )

  const notificationResponse =
    executeResponse ||
    approveResponse ||
    gasAddResponse ||
    refundResponse

  const explorer =
    notificationResponse &&
      (
        notificationResponse.is_axelar_transaction ?
          axelar_chain_data :
          executeResponse ?
            destination_chain_data :
            source_chain_data
      )?.explorer

  const stepClassName = 'min-h-full bg-white dark:bg-slate-900 rounded-lg space-y-2 py-4 px-5'
  const titleClassName = 'whitespace-nowrap uppercase text-lg font-bold'

  return (
    <div className="space-y-4 mt-2 mb-6 mx-auto">
      {
        tx &&
        equals_ignore_case(
          gmp?.tx,
          tx,
        ) ?
          <>
            {
              notificationResponse &&
              (
                <Notification
                  hideButton={true}
                  outerClassNames="w-full h-auto z-50 transform fixed top-0 left-0 p-0"
                  innerClassNames={
                    `${
                      notificationResponse.status === 'failed' ?
                        'bg-red-500 dark:bg-red-600' :
                        notificationResponse.status === 'success' ?
                          'bg-green-500 dark:bg-green-600' :
                          'bg-blue-600 dark:bg-blue-700'
                    } text-white`
                  }
                  animation="animate__animated animate__fadeInDown"
                  icon={
                    notificationResponse.status === 'failed' ?
                      <BiXCircle
                        className="w-6 h-6 stroke-current mr-2"
                      /> :
                      notificationResponse.status === 'success' ?
                        <BiCheckCircle
                          className="w-6 h-6 stroke-current mr-2"
                        /> :
                        <div className="mr-2">
                          <Watch
                            color="white"
                            width="20"
                            height="20"
                          />
                        </div>
                  }
                  content={
                    <div className="flex items-center">
                      <span className="break-all mr-2">
                        {notificationResponse.message}
                      </span>
                      {
                        explorer?.url &&
                        notificationResponse.txHash &&
                        (
                          <a
                            href={`${explorer.url}${explorer.transaction_path?.replace('{tx}', notificationResponse.txHash)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mr-2"
                          >
                            <span className="font-semibold">
                              View on {explorer.name}
                            </span>
                          </a>
                        )
                      }
                      {
                        notificationResponse.status === 'failed' &&
                        notificationResponse.message &&
                        (
                          <Copy
                            value={notificationResponse.message}
                            size={20}
                            className="cursor-pointer text-slate-200 hover:text-white"
                          />
                        )
                      }
                    </div>
                  }
                  onClose={() => {
                    setApproveResponse(null)
                    setExecuteResponse(null)
                    setGasAddResponse(null)
                    setRefundResponse(null)
                  }}
                />
              )
            }
            <div className="grid sm:grid-cols-4 gap-6">
              <div className={`${stepClassName} sm:col-span-4`}>
                <div className={`${titleClassName}`}>
                  GMP
                </div>
                {data ?
                  <div className="overflow-x-auto flex flex-col sm:flex-row justify-between space-y-4 sm:space-y-0 sm:space-x-4">
                    <div className="flex flex-col space-y-4">
                      <div className="max-w-min bg-slate-50 dark:bg-slate-800 rounded-lg text-base font-semibold py-0.5 px-2">
                        Method
                      </div>
                      <div className="space-y-1.5">
                        <div className="max-w-min text-xs lg:text-sm font-semibold">
                          {
                            event === 'ContractCall' ?
                              'callContract' :
                              event === 'ContractCallWithToken' ?
                                'callContractWithToken' :
                                event ||
                                '-'
                          }
                        </div>
                        {
                          amount &&
                          _symbol &&
                          (
                            <div className="min-w-max max-w-min flex items-center justify-center sm:justify-end space-x-1.5">
                              {
                                asset_image &&
                                (
                                  <Image
                                    src={asset_image}
                                    className="w-6 sm:w-5 lg:w-6 h-6 sm:h-5 lg:h-6 rounded-full"
                                  />
                                )
                              }
                              <span className="text-base sm:text-sm lg:text-base font-semibold">
                                {
                                  asset_data &&
                                  (
                                    <span className="mr-1">
                                      {number_format(
                                        utils.formatUnits(
                                          BigNumber.from(
                                            amount,
                                          ),
                                          decimals,
                                        ),
                                        '0,0.000',
                                        true,
                                      )}
                                    </span>
                                  )
                                }
                                <span>
                                  {_symbol}
                                </span>
                              </span>
                            </div>
                          )
                        }
                        {
                          is_insufficient_minimum_amount &&
                          (
                            <div className="w-fit bg-red-100 dark:bg-red-900 bg-opacity-75 dark:bg-opacity-75 border border-red-500 dark:border-red-500 rounded whitespace-nowrap text-xs font-medium mt-1 py-0.5 px-1.5">
                              Insufficient Amount
                            </div>
                          )
                        }
                        {
                          (
                            fees?.destination_base_fee ||
                            fees?.base_fee
                          ) >= 0 &&
                          (
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold">
                                Base fees:
                              </span>
                              <div className="max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg whitespace-nowrap py-0.5 px-1.5">
                                <span className="text-xs font-semibold mr-1">
                                  {number_format(
                                    fees?.destination_base_fee ||
                                    fees?.base_fee,
                                    '0,0.000000',
                                  )}
                                </span>
                                <span className="text-xs font-semibold">
                                  {fees.destination_native_token?.symbol}
                                </span>
                              </div>
                              {
                                typeof gas?.gas_base_fee_amount === 'number' &&
                                (
                                  <div className="max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg whitespace-nowrap py-0.5 px-1.5">
                                    <span className="text-xs font-medium mr-1">
                                      =
                                    </span>
                                    <span className="text-xs font-semibold">
                                      <span className="mr-1">
                                        {number_format(
                                          gas.gas_base_fee_amount,
                                          '0,0.00000000',
                                          true,
                                        )}
                                      </span>
                                      <span>
                                        {
                                          fees.source_token?.symbol ||
                                          _.head(
                                            source_chain_data?.provider_params
                                          )?.nativeCurrency?.symbol}
                                      </span>
                                    </span>
                                  </div>
                                )
                              }
                            </div>
                          )
                        }
                      </div>
                      {
                        callback?.call &&
                        (
                          <div className="space-y-1.5">
                            <Link href={`/gmp/${callback.call.transactionHash}`}>
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                className="max-w-min bg-blue-50 hover:bg-blue-100 dark:bg-blue-400 dark:hover:bg-blue-500 border border-blue-500 rounded-lg cursor-pointer whitespace-nowrap flex items-center text-blue-600 dark:text-white space-x-0.5 py-0.5 pl-2 pr-1"
                              >
                                <span className="text-xs font-semibold hover:font-bold">
                                  2-Way Call
                                </span>
                                <HiArrowSmRight
                                  size={16}
                                />
                              </a>
                            </Link>
                            <div className="flex items-center space-x-1">
                              <Link href={`/gmp/${callback.call.transactionHash}`}>
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                    <span className="xl:hidden">
                                      {ellipse(
                                        callback.call.transactionHash,
                                        8,
                                      )}
                                    </span>
                                    <span className="hidden xl:block">
                                      {ellipse(
                                        callback.call.transactionHash,
                                        12,
                                      )}
                                    </span>
                                  </div>
                                </a>
                              </Link>
                              <Copy
                                value={callback.call.transactionHash}
                              />
                            </div>
                          </div>
                        )
                      }
                      {
                        origin?.call &&
                        (
                          <div className="space-y-1.5">
                            <Link href={`/gmp/${origin.call.transactionHash}`}>
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                className="max-w-min bg-blue-50 hover:bg-blue-100 dark:bg-blue-400 dark:hover:bg-blue-500 border border-blue-500 rounded-lg cursor-pointer whitespace-nowrap flex items-center text-blue-600 dark:text-white space-x-0.5 py-0.5 pl-1 pr-2"
                              >
                                <HiArrowSmLeft
                                  size={16}
                                />
                                <span className="text-xs font-semibold hover:font-bold">
                                  2-Way Call
                                </span>
                              </a>
                            </Link>
                            <div className="flex items-center space-x-1">
                              <Link href={`/gmp/${origin.call.transactionHash}`}>
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                    <span className="xl:hidden">
                                      {ellipse(
                                        origin.call.transactionHash,
                                        8,
                                      )}
                                    </span>
                                    <span className="hidden xl:block">
                                      {ellipse(
                                        origin.call.transactionHash,
                                        12,
                                      )}
                                    </span>
                                  </div>
                                </a>
                              </Link>
                              <Copy
                                value={origin.call.transactionHash}
                              />
                            </div>
                          </div>
                        )
                      }
                    </div>
                    <div className="flex flex-col space-y-2">
                      <div className="max-w-min bg-slate-50 dark:bg-slate-800 rounded-lg text-base font-semibold py-0.5 px-2">
                        Source
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {
                          source_chain_data?.image &&
                          (
                            <Image
                              src={source_chain_data.image}
                              className="w-8 sm:w-6 lg:w-8 h-8 sm:h-6 lg:h-8 rounded-full"
                            />
                          )
                        }
                        <span className="text-base sm:text-sm lg:text-base font-bold">
                          {
                            source_chain_data?.name ||
                            chain
                          }
                        </span>
                      </div>
                      {
                        from &&
                        (
                          <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-slate-600 font-semibold">
                              Sender address
                            </span>
                            {
                              from.startsWith('0x') ?
                                <div className="flex items-center space-x-1">
                                  <a
                                    href={`${source_chain_data?.explorer?.url}${source_chain_data?.explorer?.address_path?.replace('{address}', from)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <EnsProfile
                                      address={from}
                                      no_copy={true}
                                      fallback={
                                        <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                          {ellipse(
                                            from,
                                            12,
                                            source_chain_data?.prefix_address,
                                          )}
                                        </div>
                                      }
                                    />
                                  </a>
                                  <Copy
                                    value={from}
                                  />
                                </div> :
                                <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                  <AccountProfile
                                    address={from}
                                    prefix={source_chain_data?.prefix_address}
                                  />
                                </div>
                            }
                          </div>
                        )
                      }
                      {
                        sender &&
                        (
                          <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-slate-600 font-semibold">
                              Source address
                            </span>
                            {
                              sender.startsWith('0x') ?
                                <div className="flex items-center space-x-1">
                                  <a
                                    href={`${source_chain_data?.explorer?.url}${source_chain_data?.explorer?.address_path?.replace('{address}', sender)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <EnsProfile
                                      address={sender}
                                      no_copy={true}
                                      fallback={
                                        <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                          {ellipse(
                                            sender,
                                            12,
                                            source_chain_data?.prefix_address,
                                          )}
                                        </div>
                                      }
                                    />
                                  </a>
                                  <Copy
                                    value={sender}
                                  />
                                </div> :
                                <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                  <AccountProfile
                                    address={sender}
                                    prefix={source_chain_data?.prefix_address}
                                  />
                                </div>
                            }
                          </div>
                        )
                      }
                    </div>
                    <div className="flex flex-col space-y-2">
                      <div className="max-w-min bg-slate-50 dark:bg-slate-800 rounded-lg text-base font-semibold py-0.5 px-2">
                        Destination
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {
                          destination_chain_data?.image &&
                          (
                            <Image
                              src={destination_chain_data.image}
                              className="w-8 sm:w-6 lg:w-8 h-8 sm:h-6 lg:h-8 rounded-full"
                            />
                          )
                        }
                        <span className="text-base sm:text-sm lg:text-base font-bold">
                          {
                            destination_chain_data?.name ||
                            destinationChain
                          }
                        </span>
                      </div>
                      {
                        is_invalid_destination_chain &&
                        (
                          <div className="w-fit bg-red-100 dark:bg-red-900 bg-opacity-75 dark:bg-opacity-75 border border-red-500 dark:border-red-500 rounded whitespace-nowrap text-xs font-medium mt-1 py-0.5 px-1.5">
                            Invalid Chain
                          </div>
                        )
                      }
                      {
                        destinationContractAddress &&
                        (
                          <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-slate-600 font-semibold">
                              Contract address
                            </span>
                            {
                              destinationContractAddress.startsWith('0x') ?
                                <div className="flex items-center space-x-1">
                                  <a
                                    href={`${destination_chain_data?.explorer?.url}${destination_chain_data?.explorer?.address_path?.replace('{address}', destinationContractAddress)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <EnsProfile
                                      address={destinationContractAddress}
                                      no_copy={true}
                                      fallback={
                                        <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                          {ellipse(
                                            destinationContractAddress,
                                            12,
                                            destination_chain_data?.prefix_address,
                                          )}
                                        </div>
                                      }
                                    />
                                  </a>
                                  <Copy
                                    value={destinationContractAddress}
                                  />
                                </div> :
                                <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                  <AccountProfile
                                    address={destinationContractAddress}
                                    prefix={destination_chain_data?.prefix_address}
                                  />
                                </div>
                            }
                          </div>
                        )
                      }
                      {
                        equals_ignore_case(
                          status,
                          'executed',
                        ) &&
                        relayer &&
                        (
                          <div className="flex flex-col">
                            <span className="text-slate-400 dark:text-slate-600 font-semibold">
                              Relayer address
                            </span>
                            {
                              relayer.startsWith('0x') ?
                                <div className="flex items-center space-x-1">
                                  <a
                                    href={`${destination_chain_data?.explorer?.url}${destination_chain_data?.explorer?.address_path?.replace('{address}', relayer)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <EnsProfile
                                      address={relayer}
                                      no_copy={true}
                                      fallback={
                                        <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                          {ellipse(
                                            relayer,
                                            12,
                                            destination_chain_data?.prefix_address,
                                          )}
                                        </div>
                                      }
                                    />
                                  </a>
                                  <Copy
                                    value={relayer}
                                  />
                                </div> :
                                <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                  <AccountProfile
                                    address={relayer}
                                    prefix={destination_chain_data?.prefix_address}
                                  />
                                </div>
                            }
                          </div>
                        )
                      }
                    </div>
                    <div className="min-w-max flex flex-col">
                      <div className="max-w-min bg-slate-50 dark:bg-slate-800 rounded-lg text-base font-semibold pt-0.5 pb-1 px-2">
                        Status
                      </div>
                      {steps
                        .filter(s =>
                          ![
                            'refunded',
                          ]
                          .includes(s.id) ||
                          s.data?.receipt?.status
                        )
                        .map((s, i) => {
                          const _error =
                            error &&
                            (
                              error?.block_timestamp ||
                              approved?.block_timestamp
                            ) ?
                              moment()
                                .diff(
                                  moment(
                                    (
                                      error?.block_timestamp ||
                                      approved.block_timestamp
                                    ) *
                                    1000
                                  ),
                                  'seconds',
                                ) >= 45 ?
                                error :
                                null :
                              error

                          const text_color =
                            (
                              ![
                                'refunded',
                              ]
                              .includes(s.id) &&
                              s.data
                            ) ||
                            (
                              [
                                'gas_paid',
                              ]
                              .includes(s.id) &&
                              (
                                gas_paid_to_callback ||
                                (
                                  is_call_from_relayer &&
                                  approved
                                )
                              )
                            ) ||
                            (
                              [
                                'executed',
                              ]
                              .includes(s.id) &&
                              is_executed
                            ) ||
                            (
                              [
                                'refunded',
                              ]
                              .includes(s.id) &&
                              s?.data?.receipt?.status
                            ) ?
                              'text-green-500 dark:text-green-400' :
                              i === current_step &&
                              ![
                                'refunded',
                              ]
                              .includes(s.id) ?
                                'text-yellow-500 dark:text-yellow-400' :
                                (
                                  [
                                    'executed',
                                  ]
                                  .includes(s.id) &&
                                  _error
                                ) ||
                                (
                                  [
                                    'refunded',
                                  ]
                                  .includes(s.id) &&
                                  !s?.data?.receipt?.status
                                ) ?
                                  'text-red-500 dark:text-red-400' :
                                  'text-slate-300 dark:text-slate-700'

                          const {
                            explorer,
                          } = { ...s.chain_data }
                          const {
                            url,
                            transaction_path,
                            icon,
                          } = { ...explorer }

                          return (
                            <div
                              key={i}
                              className="flex items-center space-x-1.5 pb-0.5"
                            >
                              {
                                (
                                  ![
                                    'refunded',
                                  ]
                                  .includes(s.id) &&
                                  s.data
                                ) ||
                                (
                                  [
                                    'gas_paid',
                                  ]
                                  .includes(s.id) &&
                                  (
                                    gas_paid_to_callback ||
                                    (
                                      is_call_from_relayer &&
                                      approved
                                    )
                                  )
                                ) ||
                                (
                                  [
                                    'executed',
                                  ]
                                  .includes(s.id) &&
                                  is_executed
                                ) ||
                                (
                                  [
                                    'refunded',
                                  ]
                                  .includes(s.id) &&
                                  s?.data?.receipt?.status
                                ) ?
                                  <BiCheckCircle
                                    size={18}
                                    className="text-green-500 dark:text-green-400"
                                  /> :
                                  i === current_step &&
                                  ![
                                    'refunded',
                                  ]
                                  .includes(s.id) ?
                                    <ProgressBar
                                      borderColor="#ca8a04"
                                      barColor="#facc15"
                                      width="18"
                                      height="18"
                                    /> :
                                    (
                                      [
                                        'executed',
                                      ]
                                      .includes(s.id) &&
                                      _error
                                    ) ||
                                    (
                                    [
                                      'refunded',
                                    ]
                                    .includes(s.id) &&
                                    !s?.data?.receipt?.status) ?
                                      <BiXCircle
                                        size={18}
                                        className="text-red-500 dark:text-red-400"
                                      /> :
                                      <FiCircle
                                        size={18}
                                        className="text-slate-300 dark:text-slate-700"
                                      />
                              }
                              <div className="flex items-center space-x-1">
                                {
                                  s.data?.transactionHash ?
                                    <Copy
                                      value={s.data.transactionHash}
                                      title={
                                        <span className={`cursor-pointer uppercase ${text_color} text-xs font-semibold`}>
                                          {s.title}
                                        </span>
                                      }
                                    /> :
                                    <span className={`uppercase ${text_color} text-xs font-medium`}>
                                      {s.title}
                                    </span>
                                }
                                {
                                  url &&
                                  s.data?.transactionHash &&
                                  (
                                    <a
                                      href={`${url}${transaction_path?.replace('{tx}', s.data.transactionHash)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 dark:text-blue-500"
                                    >
                                      {icon ?
                                        <Image
                                          src={icon}
                                          className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                        /> :
                                        <TiArrowRight
                                          size={16}
                                          className="transform -rotate-45"
                                        />
                                      }
                                    </a>
                                  )
                                }
                              </div>
                            </div>
                          )
                        })
                      }
                      <div className="flex flex-col space-y-1">
                        {
                          is_invalid_call &&
                          (
                            <div className="w-fit bg-red-100 dark:bg-red-900 bg-opacity-75 dark:bg-opacity-75 border border-red-500 dark:border-red-500 rounded whitespace-nowrap text-xs font-medium mt-1 py-0.5 px-1.5">
                              Invalid Call
                            </div>
                          )
                        }
                        {
                          is_insufficient_fee &&
                          (
                            <div className="w-fit bg-red-100 dark:bg-red-900 bg-opacity-75 dark:bg-opacity-75 border border-red-500 dark:border-red-500 rounded whitespace-nowrap text-xs font-medium mt-1 py-0.5 px-1.5">
                              Insufficient Fee
                            </div>
                          )
                        }
                        {
                          forecall_time_spent &&
                          (
                            <Tooltip
                              placement="bottom"
                              content="Express execute time spent"
                              className="z-50 bg-black bg-opacity-75 text-white text-xs -ml-7"
                            >
                              <div className="flex items-center space-x-1">
                                <RiTimerFlashLine
                                  size={18}
                                  className="text-green-500 dark:text-green-400"
                                />
                                <span className="whitespace-nowrap text-xs font-bold">
                                  {forecall_time_spent}
                                </span>
                              </div>
                            </Tooltip>
                          )
                        }
                        {gasAddButton}
                        {refundButton}
                        {
                          approveButton ||
                          executeButton ||
                          (
                            time_spent &&
                            (
                              <Tooltip
                                placement="bottom"
                                content="Time spent"
                                className="z-50 bg-black bg-opacity-75 text-white text-xs -ml-7"
                              >
                                <div className="flex items-center space-x-1">
                                  <BiTime
                                    size={18}
                                    className="text-green-500 dark:text-green-400"
                                  />
                                  <span className="whitespace-nowrap text-xs font-bold">
                                    {time_spent}
                                  </span>
                                </div>
                              </Tooltip>
                            )
                          )
                        }
                      </div>
                    </div>
                  </div> :
                  <span className="text-slate-400 dark:text-slate-200 text-base font-semibold">
                    Data not found
                  </span>
                }
              </div>
              {data && detail_steps.map((s, i) => {
                const { callback } = { ...gmp }
                const { call, gas_paid, gas_added_transactions, forecalled, approved, executed, error, refunded, refunded_more_transactions, forecall_gas_price_rate, gas_price_rate, is_execute_from_relayer, is_error_from_relayer, status, gas, is_invalid_destination_chain, is_invalid_call, is_insufficient_minimum_amount, is_insufficient_fee } = { ...gmp.data }
                const { title, chain_data, data } = { ...s }
                const _data = ['executed'].includes(s.id) ?
                  data ||
                  (
                    error &&
                      (
                        error?.block_timestamp ||
                        approved?.block_timestamp
                      ) ?
                        moment().diff(moment((error?.block_timestamp || approved.block_timestamp) * 1000), 'seconds') >= 45 ?
                          error :
                          null :
                        error
                  ) :
                  data
                const { logIndex, blockNumber, block_timestamp, contract_address, returnValues, transaction, receipt } = { ..._data }
                let { transactionHash } = { ..._data }
                transactionHash = transactionHash ||
                  receipt?.transactionHash
                const { sender } = { ...returnValues }
                const source_chain = call?.chain
                const destination_chain = call?.returnValues?.destinationChain
                const source_chain_data = getChain(source_chain, evm_chains_data)
                const destination_chain_data = getChain(destination_chain, evm_chains_data)
                const { gasToken, gasFeeAmount, refundAddress } = { ...gas_paid?.returnValues }
                const { source_token, destination_native_token } = { ...gas_price_rate }
                const {
                  gasUsed,
                } = {
                  ...(
                    s.id === 'approved' ?
                      approved?.receipt :
                      (
                        executed?.receipt ||
                        error?.receipt
                      )
                  ),
                }
                let {
                  effectiveGasPrice,
                } = {
                  ...(
                    s.id === 'approved' ?
                      approved?.receipt :
                      (
                        executed?.receipt ||
                        error?.receipt
                      )
                  ),
                }

                if (!effectiveGasPrice) {
                  if (s.id === 'approved') {
                    if (approved) {
                      effectiveGasPrice = approved.transaction?.gasPrice
                    }
                  }
                  else {
                    if (executed) {
                      effectiveGasPrice = executed.transaction?.gasPrice
                    }
                    else if (error) {
                      effectiveGasPrice = error.transaction?.gasPrice
                    }
                  }
                }

                let source_gas_data,
                  destination_gas_data,
                  source_gas_used,
                  callback_gas_used,
                  source_forecalled_gas_used

                if (gasFeeAmount) {
                  source_gas_data = gasToken && gasToken !== constants.AddressZero ?
                    assets_data?.find(a => a?.contracts?.findIndex(c => c?.chain_id === source_chain_data?.chain_id && equals_ignore_case(c?.contract_address, gasToken)) > -1) :
                    {
                      ..._.head(source_chain_data?.provider_params)?.nativeCurrency,
                      image: source_chain_data?.image,
                    }
                  if (source_gas_data?.contracts) {
                    source_gas_data = {
                      ...source_gas_data,
                      ...source_gas_data.contracts.find(c => c?.chain_id === source_chain_data?.chain_id),
                    }
                  }
                }
                destination_gas_data = {
                  ..._.head(destination_chain_data?.provider_params)?.nativeCurrency,
                  image: destination_chain_data?.image,
                }

                try {
                  if (executed?.receipt ?
                    is_execute_from_relayer === false :
                    error?.receipt ?
                      is_error_from_relayer === false :
                      false
                  ) {
                    source_gas_used = 0
                  }
                  else {
                    const decimals = forecall_gas_price_rate?.destination_native_token?.decimals ||
                      destination_native_token.decimals || 18

                    source_gas_used = Number(
                      utils.formatUnits(
                        FixedNumber.fromString(
                          BigNumber.from(gasUsed).toString()
                        )
                        .mulUnsafe(
                          FixedNumber.fromString(
                            BigNumber.from(effectiveGasPrice).toString()
                          )
                        )
                        .mulUnsafe(
                          FixedNumber.fromString(
                            (
                              destination_native_token.token_price.usd /
                              source_token.token_price.usd
                            )
                            .toFixed(decimals)
                            .toString()
                          )
                        )
                        .round(0)
                        .toString()
                        .replace(
                          '.0',
                          '',
                        ),
                        decimals,
                      )
                    )
                  }
                } catch (error) {
                  source_gas_used = 0
                }

                if (callback) {
                  if (typeof gas?.gas_callback_amount === 'number') {
                    callback_gas_used = gas.gas_callback_amount
                  }
                  else {
                    const {
                      gasUsed,
                    } = { ...(callback.executed?.receipt || callback.error?.receipt) }
                    let {
                      effectiveGasPrice,
                    } = { ...(callback.executed?.receipt || callback.error?.receipt) }

                    if (!effectiveGasPrice) {
                      if (callback.executed) {
                        effectiveGasPrice = callback.executed.transaction?.gasPrice
                      }
                      else if (callback.error) {
                        effectiveGasPrice = callback.error.transaction?.gasPrice
                      }
                    }

                    try {
                      if (callback.executed?.receipt ?
                        callback.is_execute_from_relayer === false :
                        callback.error?.receipt ?
                          callback.is_error_from_relayer === false :
                          false
                      ) {
                        callback_gas_used = 0
                      }
                      else {
                        callback_gas_used = Number(
                          utils.formatUnits(
                            FixedNumber.fromString(
                              BigNumber.from(gasUsed || '0').toString()
                            )
                            .mulUnsafe(
                              FixedNumber.fromString(
                                BigNumber.from(effectiveGasPrice || '0').toString()
                              )
                            )
                            .round(0).toString().replace('.0', ''),
                            source_token.decimals,
                          )
                        )
                      }
                    } catch (error) {
                      callback_gas_used = 0
                    }
                  }
                }

                try {
                  source_forecalled_gas_used = Number(
                    utils.formatUnits(
                      FixedNumber.fromString(
                        BigNumber.from(forecalled?.receipt?.gasUsed || '0').toString()
                      )
                      .mulUnsafe(
                        FixedNumber.fromString(
                          BigNumber.from(
                            forecalled?.receipt?.effectiveGasPrice ||
                            forecalled?.transaction?.gasPrice ||
                            '0'
                          ).toString()
                        )
                      )
                      .mulUnsafe(
                        FixedNumber.fromString(
                          (
                            (forecall_gas_price_rate?.destination_native_token?.token_price?.usd || destination_native_token?.token_price?.usd) /
                            (forecall_gas_price_rate?.source_token?.token_price?.usd || source_token?.token_price?.usd)
                          ).toString()
                        )
                      )
                      .round(0).toString().replace('.0', ''),
                      forecall_gas_price_rate?.destination_native_token?.decimals ||
                        destination_native_token.decimals,
                    )
                  )
                } catch (error) {
                  source_forecalled_gas_used = 0
                }

                const refunded_amount = gasFeeAmount &&
                  refunded?.amount

                const from = receipt?.from || transaction?.from
                const to = !['forecalled', 'executed', 'refunded'].includes(s.id) ?
                  contract_address :
                  ['refunded'].includes(s.id) ?
                    _data?.to || refundAddress :
                    destinationContractAddress
                const { explorer } = { ...chain_data }
                const { url, transaction_path, block_path, address_path, icon } = { ...explorer }

                const refreshButton = editable &&
                  [
                    'executed',
                    'refunded',
                  ].includes(s.id) &&
                  (
                    (
                      s.id === 'executed' &&
                      (
                        (
                          !executed &&
                          (is_executed || error)
                        ) ||
                        (
                          executed
                        )
                      )
                    ) ||
                    (
                      [
                        'refunded',
                      ].includes(s.id) &&
                      typeof receipt?.status !== 'number'
                    ) ||
                    !block_timestamp
                  ) &&
                  (
                    <button
                      disabled={s.id === 'refunded' ?
                        txHashRefundEditUpdating :
                        txHashEditUpdating
                      }
                      onClick={async () => {
                        if (s.id === 'refunded') {
                          setTxHashRefundEditUpdating(true)
                        }
                        else {
                          setTxHashEditUpdating(true)
                        }

                        await saveGMP(
                          call?.transactionHash,
                          call?.transactionIndex,
                          call?.logIndex,
                          transactionHash,
                          transaction?.from,
                          undefined,
                          [
                            'refunded',
                          ].includes(s.id) ?
                            s.id :
                            s.id === 'executed' &&
                            !executed &&
                            (is_executed || error) ?
                              'not_executed' :
                              executed ?
                                're_execute' :
                                undefined,
                        )

                        if (s.id === 'refunded') {
                          setTxHashRefundEditUpdating(false)
                        }
                        else {
                          setTxHashEditUpdating(false)
                        }
                      }}
                      className={`${(s.id === 'refunded' ? txHashRefundEditUpdating : txHashEditUpdating) ? 'hidden' : ''} cursor-pointer text-white hover:text-blue-500 dark:text-slate-900 dark:hover:text-white`}
                    >
                      <MdRefresh size={20} />
                    </button>
                  )

                const rowClassName = 'flex space-x-4'
                const rowTitleClassName = `w-32 whitespace-nowrap text-black dark:text-slate-300 text-sm lg:text-base font-bold`

                return (
                  <div
                    key={i}
                    className={`${stepClassName} sm:col-span-3 lg:col-span-2`}
                  >
                    <div className={`${titleClassName}`}>
                      {title}
                    </div>
                    <div className="flex flex-col space-y-3">
                      {['executed'].includes(s.id) && (executeButton || (!data && is_executed)) ?
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Tx Hash:
                          </span>
                          <div className="flex items-center space-x-1">
                            {txHashEditing ?
                              <input
                                disabled={txHashEditUpdating}
                                placement="Transaction Hash"
                                value={txHashEdit}
                                onChange={e => setTxHashEdit(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 rounded-lg text-base py-1 px-2"
                              /> :
                              transactionHash ?
                                <>
                                  <a
                                    href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 dark:text-blue-500 font-medium"
                                  >
                                    <div className="text-sm lg:text-base">
                                      <span className="xl:hidden">
                                        {ellipse(
                                          transactionHash,
                                          12,
                                        )}
                                      </span>
                                      <span className="hidden xl:block">
                                        {ellipse(
                                          transactionHash,
                                          16,
                                        )}
                                      </span>
                                    </div>
                                  </a>
                                  <Copy
                                    value={transactionHash}
                                    size={18}
                                  />
                                  <a
                                    href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 dark:text-blue-500"
                                  >
                                    {icon ?
                                      <Image
                                        src={icon}
                                        className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                      /> :
                                      <TiArrowRight
                                        size={16}
                                        className="transform -rotate-45"
                                      />
                                    }
                                  </a>
                                </> :
                                !(!data && is_executed) &&
                                !error &&
                                !is_invalid_destination_chain &&
                                !is_invalid_call &&
                                !is_insufficient_minimum_amount &&
                                !is_insufficient_fee && (
                                  <ColorRing
                                    color={loader_color(theme)}
                                    width="32"
                                    height="32"
                                  />
                                )
                            }
                            {txHashEditing ?
                              <>
                                <button
                                  disabled={txHashEditUpdating}
                                  onClick={() => resetTxHashEdit()}
                                  className="text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500"
                                >
                                  <RiCloseCircleFill size={20} />
                                </button>
                                <button
                                  disabled={!txHashEdit || txHashEditUpdating}
                                  onClick={async () => {
                                    setTxHashEditUpdating(true)
                                    await saveGMP(
                                      call?.transactionHash,
                                      call?.transactionIndex,
                                      call?.logIndex,
                                      txHashEdit,
                                      address,
                                    )
                                  }}
                                  className="text-blue-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-white"
                                >
                                  {txHashEditUpdating ?
                                    <TailSpin
                                      color={loader_color(theme)}
                                      width="16"
                                      height="16"
                                    /> :
                                    <BiSave size={20} />
                                  }
                                </button>
                              </> :
                              editable && (
                                <button
                                  onClick={() => setTxHashEditing(true)}
                                  className="text-white hover:text-slate-400 dark:text-slate-900 dark:hover:text-slate-400"
                                >
                                  <BiEditAlt size={20} />
                                </button>
                              )
                            }
                          </div>
                          {refreshButton}
                        </div> :
                        ['refunded'].includes(s.id) && (!data || data.error) ?
                          <div className={rowClassName}>
                            <span className={rowTitleClassName}>
                              Tx Hash:
                            </span>
                            <div className="flex items-center space-x-1">
                              {txHashRefundEditing ?
                                <input
                                  disabled={txHashRefundEditUpdating}
                                  placement="Transaction Hash"
                                  value={txHashRefundEdit}
                                  onChange={e => setTxHashRefundEdit(e.target.value)}
                                  className="bg-slate-50 dark:bg-slate-800 rounded-lg text-base py-1 px-2"
                                /> :
                                transactionHash ?
                                  <>
                                    <a
                                      href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 dark:text-blue-500 font-medium"
                                    >
                                      <div className="text-sm lg:text-base">
                                        <span className="xl:hidden">
                                          {ellipse(
                                            transactionHash,
                                            12,
                                          )}
                                        </span>
                                        <span className="hidden xl:block">
                                          {ellipse(
                                            transactionHash,
                                            16,
                                          )}
                                        </span>
                                      </div>
                                    </a>
                                    <Copy
                                      value={transactionHash}
                                      size={18}
                                    />
                                    <a
                                      href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 dark:text-blue-500"
                                    >
                                      {icon ?
                                        <Image
                                          src={icon}
                                          className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                        /> :
                                        <TiArrowRight
                                          size={16}
                                          className="transform -rotate-45"
                                        />
                                      }
                                    </a>
                                  </> :
                                  null
                              }
                              {txHashRefundEditing ?
                                <>
                                  <button
                                    disabled={txHashRefundEditUpdating}
                                    onClick={() => resetTxHashEdit()}
                                    className="text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500"
                                  >
                                    <RiCloseCircleFill size={20} />
                                  </button>
                                  <button
                                    disabled={!txHashRefundEdit || txHashRefundEditUpdating}
                                    onClick={async () => {
                                      setTxHashRefundEditUpdating(true)
                                      await saveGMP(
                                        call?.transactionHash,
                                        call?.transactionIndex,
                                        call?.logIndex,
                                        txHashRefundEdit,
                                        address,
                                        undefined,
                                        'refunded',
                                      )
                                    }}
                                    className="text-blue-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-white"
                                  >
                                    {txHashRefundEditUpdating ?
                                      <TailSpin
                                        color={loader_color(theme)}
                                        width="16"
                                        height="16"
                                      /> :
                                      <BiSave size={20} />
                                    }
                                  </button>
                                </> :
                                editable && (
                                  <button
                                    onClick={() => setTxHashRefundEditing(true)}
                                    className="text-white hover:text-slate-400 dark:text-slate-900 dark:hover:text-slate-400"
                                  >
                                    <BiEditAlt size={20} />
                                  </button>
                                )
                              }
                            </div>
                          </div> :
                          transactionHash ?
                            <div className={rowClassName}>
                              <span className={rowTitleClassName}>
                                Tx Hash:
                              </span>
                              <div className="flex items-center space-x-1">
                                <a
                                  href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 dark:text-blue-500 font-medium"
                                >
                                  <div className="text-sm lg:text-base">
                                    <span className="xl:hidden">
                                      {ellipse(
                                        transactionHash,
                                        12,
                                      )}
                                    </span>
                                    <span className="hidden xl:block">
                                      {ellipse(
                                        transactionHash,
                                        16,
                                      )}
                                    </span>
                                  </div>
                                </a>
                                <Copy
                                  value={transactionHash}
                                  size={18}
                                />
                                <a
                                  href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 dark:text-blue-500"
                                >
                                  {icon ?
                                    <Image
                                      src={icon}
                                      className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                    /> :
                                    <TiArrowRight
                                      size={16}
                                      className="transform -rotate-45"
                                    />
                                  }
                                </a>
                                {refreshButton}
                              </div>
                            </div> :
                            ['gas_paid'].includes(s.id) && origin?.call ?
                              <div className="space-y-1.5">
                                <Link href={`/gmp/${origin.call.transactionHash}`}>
                                  <a
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="max-w-min bg-blue-50 hover:bg-blue-100 dark:bg-blue-400 dark:hover:bg-blue-500 border border-blue-500 rounded-lg cursor-pointer whitespace-nowrap flex items-center text-blue-600 dark:text-white space-x-0.5 py-0.5 pl-1 pr-2"
                                  >
                                    <HiArrowSmLeft size={16} />
                                    <span className="text-xs font-semibold hover:font-bold">
                                      from 1st Call
                                    </span>
                                  </a>
                                </Link>
                                <div className="flex items-center space-x-1">
                                  <Link href={`/gmp/${origin.call.transactionHash}`}>
                                    <a
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                        <span className="xl:hidden">
                                          {ellipse(
                                            origin.call.transactionHash,
                                            8,
                                          )}
                                        </span>
                                        <span className="hidden xl:block">
                                          {ellipse(
                                            origin.call.transactionHash,
                                            12,
                                          )}
                                        </span>
                                      </div>
                                    </a>
                                  </Link>
                                  <Copy
                                    value={origin.call.transactionHash}
                                    size={18}
                                  />
                                </div>
                              </div> :
                              ['gas_paid'].includes(s.id) && ['executed', 'error'].includes(status) ?
                                <span className="text-slate-400 dark:text-slate-200 text-base font-semibold">
                                  No transaction
                                </span> :
                                !is_invalid_destination_chain &&
                                !is_invalid_call &&
                                !is_insufficient_minimum_amount &&
                                !is_insufficient_fee && (
                                  <ColorRing
                                    color={loader_color(theme)}
                                    width="32"
                                    height="32"
                                  />
                                )
                      }
                      {typeof logIndex === 'number' && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Log Index:
                          </span>
                          <div className="flex items-center space-x-1">
                            <a
                              href={`${url}${transaction_path?.replace('{tx}', transactionHash)}#eventlog`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 dark:text-blue-500 text-sm lg:text-base font-medium"
                            >
                              {number_format(
                                logIndex,
                                '0,0',
                              )}
                            </a>
                          </div>
                        </div>
                      )}
                      {typeof blockNumber === 'number' && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Block:
                          </span>
                          <div className="flex items-center space-x-1">
                            <a
                              href={`${url}${block_path?.replace('{block}', blockNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 dark:text-blue-500 text-sm lg:text-base font-medium"
                            >
                              {number_format(
                                blockNumber,
                                '0,0',
                              )}
                            </a>
                          </div>
                        </div>
                      )}
                      {(_data || (['executed'].includes(s.id) && is_executed)) && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Status:
                          </span>
                          <div className={`${receipt?.status || (typeof receipt?.status !== 'number' && transactionHash && !['executed', 'refunded'].includes(s.id)) || (typeof receipt?.status !== 'number' && ['executed'].includes(s.id) && is_executed) ? 'text-green-400 dark:text-green-300' : 'text-red-500 dark:text-red-600'} uppercase flex items-center text-sm lg:text-base font-bold space-x-1`}>
                            {receipt?.status ||
                              (typeof receipt?.status !== 'number' && transactionHash && !['executed', 'refunded'].includes(s.id)) ||
                              (typeof receipt?.status !== 'number' && ['executed'].includes(s.id) && is_executed) ?
                              <BiCheckCircle size={20} /> :
                              <BiXCircle size={20} />
                            }
                            <span>
                              {receipt?.status ||
                                (typeof receipt?.status !== 'number' && transactionHash && !['executed', 'refunded'].includes(s.id)) ||
                                (typeof receipt?.status !== 'number' && ['executed'].includes(s.id) && is_executed) ?
                                'Success' :
                                'Error'
                              }
                            </span>
                          </div>
                        </div>
                      )}
                      {block_timestamp && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Time:
                          </span>
                          <span className="whitespace-nowrap text-slate-400 dark:text-slate-600 text-sm lg:text-base font-medium">
                            {moment(block_timestamp * 1000).fromNow()} ({moment(block_timestamp * 1000).format('MMM D, YYYY h:mm:ss A')})
                          </span>
                        </div>
                      )}
                      {['gas_paid', 'refunded'].includes(s.id) && gasFeeAmount && source_gas_data && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Gas Paid:
                          </span>
                          <div className="flex flex-wrap items-center">
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 py-1 px-2.5 mb-0.5 mr-1">
                              {source_gas_data.image && (
                                <Image
                                  src={source_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    utils.formatUnits(
                                      BigNumber.from(gasFeeAmount),
                                      source_gas_data.decimals,
                                    ),
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(source_gas_data.symbol)}
                                </span>
                              </span>
                            </div>
                            {gas_added_transactions?.map((g, j) => {
                              const {
                                transactionHash,
                                returnValues,
                              } = { ...g }
                              const {
                                gasFeeAmount,
                              } = { ...returnValues }

                              return (
                                <a
                                  key={j}
                                  href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 py-1 px-2.5 mb-0.5 mr-1"
                                >
                                  <span className="text-2xs font-semibold">
                                    <span className="mr-1">
                                      {number_format(
                                        utils.formatUnits(
                                          BigNumber.from(gasFeeAmount),
                                          source_gas_data.decimals,
                                        ),
                                        '+0,0.00000000',
                                        true,
                                      )}
                                    </span>
                                    <span>
                                      {ellipse(source_gas_data.symbol)}
                                    </span>
                                  </span>
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {['forecalled', 'refunded'].includes(s.id) && forecalled?.receipt?.gasUsed && (forecalled.receipt.effectiveGasPrice || forecalled.transaction?.gasPrice) && destination_gas_data && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            {['refunded'].includes(s.id) ?
                              'Gas Forecall' :
                              'Gas Used'
                            }:
                          </span>
                          <div className="flex flex-wrap items-center">
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 my-0.5 mr-2 py-1 px-2.5">
                              {destination_gas_data?.image && (
                                <Image
                                  src={destination_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    utils.formatUnits(
                                      FixedNumber.fromString(
                                        BigNumber.from(forecalled.receipt.gasUsed).toString()
                                      )
                                      .mulUnsafe(
                                        FixedNumber.fromString(
                                          BigNumber.from(
                                            forecalled.receipt.effectiveGasPrice ||
                                            forecalled.transaction.gasPrice
                                          ).toString()
                                        )
                                      )
                                      .round(0).toString().replace('.0', ''),
                                      destination_gas_data.decimals,
                                    ),
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(destination_gas_data.symbol)}
                                </span>
                              </span>
                            </div>
                            {(forecall_gas_price_rate || gas_price_rate) && (
                              <>
                                <span className="text-sm font-medium mr-2">
                                  =
                                </span>
                                <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 my-0.5 py-1 px-2.5">
                                  {source_gas_data?.image && (
                                    <Image
                                      src={source_gas_data.image}
                                      className="w-5 h-5 rounded-full"
                                    />
                                  )}
                                  <span className="text-sm font-semibold">
                                    <span className="mr-1">
                                      {number_format(
                                        source_forecalled_gas_used,
                                        '0,0.00000000',
                                        true,
                                      )}
                                    </span>
                                    <span>
                                      {ellipse(source_gas_data?.symbol)}
                                    </span>
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {[/*'approved', */'executed', 'error', 'refunded'].includes(s.id) && gasUsed && effectiveGasPrice && destination_gas_data && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            {['refunded'].includes(s.id) ?
                              'Gas Execute' :
                              'Gas Used'
                            }:
                          </span>
                          <div className="flex flex-wrap items-center">
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 my-0.5 mr-2 py-1 px-2.5">
                              {destination_gas_data?.image && (
                                <Image
                                  src={destination_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    utils.formatUnits(
                                      FixedNumber.fromString(
                                        BigNumber.from(
                                          gasUsed
                                        )
                                        .toString()
                                      )
                                      .mulUnsafe(
                                        FixedNumber.fromString(
                                          BigNumber.from(
                                            effectiveGasPrice
                                          )
                                          .toString()
                                        )
                                      )
                                      .round(0)
                                      .toString()
                                      .replace(
                                        '.0',
                                        '',
                                      ),
                                      destination_gas_data.decimals,
                                    ),
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(destination_gas_data.symbol)}
                                </span>
                              </span>
                            </div>
                            {source_token?.token_price?.usd && destination_native_token?.token_price?.usd && (
                              <>
                                <span className="text-sm font-medium mr-2">
                                  =
                                </span>
                                <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 my-0.5 py-1 px-2.5">
                                  {source_gas_data?.image && (
                                    <Image
                                      src={source_gas_data.image}
                                      className="w-5 h-5 rounded-full"
                                    />
                                  )}
                                  <span className="text-sm font-semibold">
                                    <span className="mr-1">
                                      {number_format(
                                        source_gas_used,
                                        '0,0.00000000',
                                        true,
                                      )}
                                    </span>
                                    <span>
                                      {ellipse(source_gas_data?.symbol)}
                                    </span>
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {['refunded'].includes(s.id) && callback_gas_used > 0 && source_gas_data && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Gas Callback:
                          </span>
                          <div className="flex items-center space-x-2">
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 py-1 px-2.5">
                              {source_gas_data.image && (
                                <Image
                                  src={source_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    callback_gas_used,
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(source_gas_data.symbol)}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {['refunded'].includes(s.id) && source_token && destination_native_token && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Gas Price:
                          </span>
                          <div className="flex items-center space-x-2">
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 py-1 px-2.5">
                              {destination_gas_data?.image && (
                                <Image
                                  src={destination_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    source_token.token_price?.usd /
                                    destination_native_token.token_price?.usd,
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(destination_gas_data?.symbol)}
                                </span>
                              </span>
                            </div>
                            <span className="text-sm font-medium">
                              =
                            </span>
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 py-1 px-2.5">
                              {source_gas_data?.image && (
                                <Image
                                  src={source_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    1,
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(source_gas_data?.symbol)}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {['refunded'].includes(s.id) && receipt?.status === 1 && source_token?.token_price?.usd && destination_native_token?.token_price?.usd && refunded_amount > 0 && (!(executed?.block_timestamp || error?.block_timestamp) || block_timestamp > (executed?.block_timestamp || error?.block_timestamp) || block_timestamp < (executed?.block_timestamp || error?.block_timestamp)) && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Refunded:
                          </span>
                          <div className="flex flex-wrap items-center">
                            <div className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 mr-1 py-1 px-2.5">
                              {source_gas_data?.image && (
                                <Image
                                  src={source_gas_data.image}
                                  className="w-5 h-5 rounded-full"
                                />
                              )}
                              <span className="text-sm font-semibold">
                                <span className="mr-1">
                                  {number_format(
                                    refunded_amount,
                                    '0,0.00000000',
                                    true,
                                  )}
                                </span>
                                <span>
                                  {ellipse(source_gas_data?.symbol)}
                                </span>
                              </span>
                            </div>
                            {(refunded_more_transactions || [])
                              .filter(r => r?.amount > 0)
                              .map((r, j) => {
                                const {
                                  transactionHash,
                                  amount,
                                } = { ...r }

                                return (
                                  <a
                                    key={j}
                                    href={`${url}${transaction_path?.replace('{tx}', transactionHash)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-w-max max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:justify-end space-x-1.5 py-1 px-2.5 mb-0.5 mr-1"
                                  >
                                    <span className="text-2xs font-semibold">
                                      <span className="mr-1">
                                        {number_format(
                                          amount,
                                          '+0,0.00000000',
                                          true,
                                        )}
                                      </span>
                                      <span>
                                        {ellipse(source_gas_data.symbol)}
                                      </span>
                                    </span>
                                  </a>
                                )
                              })
                            }
                          </div>
                        </div>
                      )}
                      {to && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            {['gas_paid'].includes(s.id) ?
                              'Gas Service' :
                              ['forecalled', 'executed'].includes(s.id) ?
                                'Destination' :
                                ['refunded'].includes(s.id) ?
                                  'Receiver' :
                                  'Gateway'
                            }:
                          </span>
                          <div className="flex items-center space-x-1">
                            {to.startsWith('0x') ?
                              <div className="flex items-center space-x-1">
                                <a
                                  href={`${url}${address_path?.replace('{address}', to)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <EnsProfile
                                    address={to}
                                    no_copy={true}
                                    fallback={(
                                      <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                        {ellipse(
                                          to,
                                          12,
                                          chain_data?.prefix_address,
                                        )}
                                      </div>
                                    )}
                                  />
                                </a>
                                <Copy
                                  value={to}
                                />
                              </div> :
                              <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                <AccountProfile
                                  address={to}
                                  prefix={chain_data?.prefix_address}
                                />
                              </div>
                            }
                            <a
                              href={`${url}${address_path?.replace('{address}', to)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 dark:text-blue-500"
                            >
                              {icon ?
                                <Image
                                  src={icon}
                                  className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                /> :
                                <TiArrowRight
                                  size={16}
                                  className="transform -rotate-45"
                                />
                              }
                            </a>
                          </div>
                        </div>
                      )}
                      {from && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            {!['forecalled', 'approved', 'executed'].includes(s.id) ?
                              'Sender' :
                              ['refunded'].includes(s.id) ?
                                'Sender' :
                                ['forecalled'].includes(s.id) ?
                                  'Forecaller' :
                                  'Relayer'
                            }:
                          </span>
                          <div className="flex items-center space-x-1">
                            {from.startsWith('0x') ?
                              <div className="flex items-center space-x-1">
                                <a
                                  href={`${url}${address_path?.replace('{address}', from)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <EnsProfile
                                    address={from}
                                    no_copy={true}
                                    fallback={(
                                      <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                        {ellipse(
                                          from,
                                          12,
                                          chain_data?.prefix_address,
                                        )}
                                      </div>
                                    )}
                                  />
                                </a>
                                <Copy
                                  value={from}
                                />
                              </div> :
                              <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                <AccountProfile
                                  address={from}
                                  prefix={chain_data?.prefix_address}
                                />
                              </div>
                            }
                            <a
                              href={`${url}${address_path?.replace('{address}', from)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 dark:text-blue-500"
                            >
                              {icon ?
                                <Image
                                  src={icon}
                                  className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                /> :
                                <TiArrowRight
                                  size={16}
                                  className="transform -rotate-45"
                                />
                              }
                            </a>
                          </div>
                        </div>
                      )}
                      {['call'].includes(s.id) && sender && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Source:
                          </span>
                          <div className="flex items-center space-x-1">
                            {sender.startsWith('0x') ?
                              <div className="flex items-center space-x-1">
                                <a
                                  href={`${url}${address_path?.replace('{address}', sender)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <EnsProfile
                                    address={sender}
                                    no_copy={true}
                                    fallback={(
                                      <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                        {ellipse(
                                          sender,
                                          12,
                                          chain_data?.prefix_address,
                                        )}
                                      </div>
                                    )}
                                  />
                                </a>
                                <Copy
                                  value={sender}
                                />
                              </div> :
                              <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                <AccountProfile
                                  address={sender}
                                  prefix={chain_data?.prefix_address}
                                />
                              </div>
                            }
                            <a
                              href={`${url}${address_path?.replace('{address}', sender)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 dark:text-blue-500"
                            >
                              {icon ?
                                <Image
                                  src={icon}
                                  className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                /> :
                                <TiArrowRight
                                  size={16}
                                  className="transform -rotate-45"
                                />
                              }
                            </a>
                          </div>
                        </div>
                      )}
                      {['forecalled', 'executed'].includes(s.id) && call?.transaction?.from && (
                        <div className={rowClassName}>
                          <span className={rowTitleClassName}>
                            Receiver:
                          </span>
                          <div className="flex items-center space-x-1">
                            {call.transaction.from.startsWith('0x') ?
                              <div className="flex items-center space-x-1">
                                <a
                                  href={`${url}${address_path?.replace('{address}', call.transaction.from)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <EnsProfile
                                    address={call.transaction.from}
                                    no_copy={true}
                                    fallback={(
                                      <div className="h-6 flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                        {ellipse(
                                          call.transaction.from,
                                          12,
                                          chain_data?.prefix_address,
                                        )}
                                      </div>
                                    )}
                                  />
                                </a>
                                <Copy
                                  value={call.transaction.from}
                                />
                              </div> :
                              <div className="flex items-center text-blue-500 dark:text-blue-500 font-medium">
                                <AccountProfile
                                  address={call.transaction.from}
                                  prefix={chain_data?.prefix_address}
                                />
                              </div>
                            }
                            <a
                              href={`${url}${address_path?.replace('{address}', call.transaction.from)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 dark:text-blue-500"
                            >
                              {icon ?
                                <Image
                                  src={icon}
                                  className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                /> :
                                <TiArrowRight
                                  size={16}
                                  className="transform -rotate-45"
                                />
                              }
                            </a>
                          </div>
                        </div>
                      )}
                      {['executed'].includes(s.id) && !data && _data && (
                        <div className={rowClassName}>
                          <span
                            className={rowTitleClassName}
                            style={{ minWidth: '8rem' }}
                          >
                            Error:
                          </span>
                          <div className="flex flex-col space-y-1.5">
                            <div className="flex flex-col space-y-1.5">
                              {
                                [
                                  {
                                    id: 'message',
                                    value:
                                      _data.error?.data?.message ||
                                      _data.error?.message,
                                  },
                                ]
                                .filter(e => e?.value)
                                .map((e, j) => (
                                  <div
                                    key={j}
                                    className={`${['body'].includes(e.id) ? 'bg-slate-100 dark:bg-slate-800 rounded-lg p-2' : 'text-red-500'} font-semibold`}
                                  >
                                    {ellipse(
                                      e.value,
                                      256,
                                    )}
                                    <a
                                      href="https://docs.axelar.dev/dev/monitor-recover/recovery"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 dark:text-blue-500 text-xs font-normal ml-1"
                                    >
                                      Transaction recovery guidelines
                                    </a>
                                  </div>
                                ))
                              }
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              {
                                [
                                  {
                                    id: 'reason',
                                    value:
                                      _data.error?.reason &&
                                      `Reason: ${_data.error.reason}`,
                                  },
                                ]
                                .filter(e => e?.value)
                                .map((e, j) => (
                                  <div
                                    key={j}
                                    className={`${['body'].includes(e.id) ? 'bg-slate-100 dark:bg-slate-800 rounded-lg p-2' : 'text-red-400'} font-normal`}
                                  >
                                    {ellipse(
                                      e.value,
                                      256,
                                    )}
                                  </div>
                                ))
                              }
                            </div>
                            {
                              (
                                _data.error?.code ||
                                is_not_enough_gas
                              ) &&
                              (
                                <div className="flex items-center space-x-1.5">
                                  {_data.error?.code && (
                                    <a
                                      href={!isNaN(_data.error.code) ? 'https://docs.metamask.io/guide/ethereum-provider.html#errors' : `https://docs.ethers.io/v5/api/utils/logger/#errors-${_data.error.code ? `-${_data.error.code.toLowerCase().split('_').join('-')}` : 'ethereum'}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="max-w-min bg-slate-50 dark:bg-slate-800 rounded text-slate-400 dark:text-slate-300 text-2xs font-medium py-1 px-2"
                                    >
                                      {_data.error.code}
                                    </a>
                                  )}
                                  {is_not_enough_gas && (
                                    <div className="max-w-min bg-yellow-100 dark:bg-yellow-300 rounded whitespace-nowrap uppercase text-slate-400 dark:text-yellow-600 text-2xs font-medium py-1 px-2">
                                      {`${_data.error?.reason === 'transaction failed' ? 'Can be n' : 'N'}ot enough gas`}
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            <div className="flex flex-col space-y-1.5">
                              {
                                [
                                  {
                                    id: 'body',
                                    value:
                                      (_data.error?.body || '')
                                        .replaceAll(
                                          '"""',
                                          '',
                                        ),
                                  }
                                ]
                                .filter(e => e?.value)
                                .map((e, j) => (
                                  <div
                                    key={j}
                                    className={`${['body'].includes(e.id) ? 'bg-slate-100 dark:bg-slate-800 rounded-lg break-all p-2' : 'text-red-400'} font-normal`}
                                  >
                                    {ellipse(
                                      e.value,
                                      256,
                                    )}
                                  </div>
                                ))
                              }
                            </div>
                          </div>
                        </div>
                      )}
                      {['refunded'].includes(s.id) && _data?.error && !receipt?.status && (
                        <div className={rowClassName}>
                          <span
                            className={rowTitleClassName}
                            style={{ minWidth: '8rem' }}
                          >
                            Error:
                          </span>
                          <div className="flex flex-col space-y-1.5">
                            {_data.error?.code && (
                              <div className="max-w-min bg-red-100 dark:bg-red-700 border border-red-500 dark:border-red-600 rounded-lg font-semibold py-0.5 px-2">
                                {_data.error.code}
                              </div>
                            )}
                            <div className="flex flex-col space-y-1.5">
                              {[{
                                id: 'reason',
                                value: _data.error?.reason && `Reason: ${_data.error.reason}`,
                              }, {
                                id: 'message',
                                value: _data.error?.data?.message || _data.error?.message,
                              }, {
                                id: 'body',
                                value: _data.error?.body?.replaceAll('"""', ''),
                              }].filter(e => e?.value).map((e, j) => (
                                <div
                                  key={j}
                                  className={`${['body'].includes(e.id) ? 'bg-slate-100 dark:bg-slate-800 rounded-lg p-2' : 'text-red-500 dark:text-red-600'} ${['reason'].includes(e.id) ? 'font-bold' : 'font-medium'}`}
                                >
                                  {ellipse(e.value, 256)}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="sm:col-span-4 grid sm:grid-cols-4 gap-4">
                {
                  no_gas_remain &&
                  (
                    !refunded ||
                    (
                      refunded.receipt &&
                      !refunded.receipt.status
                    )
                  ) &&
                  (
                    executed ||
                    error
                  ) &&
                  (
                    <div className="w-fit bg-slate-100 dark:bg-slate-900 rounded-lg text-slate-400 dark:text-slate-200 text-base font-semibold p-3">
                      No refund for this GMP call.
                    </div>
                  )
                }
                {payloadHash && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      Payload Hash
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {payloadHash}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={payloadHash}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {approved && (
                  <>
                    <div className="sm:col-span-4 space-y-2">
                      <div className="text-lg font-bold">
                        Methods
                      </div>
                      <div className="max-w-min bg-slate-100 dark:bg-slate-800 rounded-lg text-base font-semibold py-0.5 px-1.5">
                        execute{symbol ? 'WithToken' : ''}
                      </div>
                    </div>
                    <div className="sm:col-span-4 text-lg font-bold">
                      Arguments
                    </div>
                  </>
                )}
                {commandId && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      commandId
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {commandId}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={commandId}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {(sourceChain || chain) && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      sourceChain
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {sourceChain || capitalize(chain)}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={sourceChain || capitalize(chain)}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {sender && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      sourceAddress
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {sender}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={sender}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {payload && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      payload
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {payload}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={payload}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {symbol && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      symbol
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {symbol}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={symbol}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {approved?.returnValues?.amount && (
                  <div className="sm:col-span-4 space-y-2">
                    <span className="text-base font-semibold">
                      amount
                    </span>
                    <div className="flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {BigNumber.from(approved.returnValues.amount).toString()}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={BigNumber.from(approved.returnValues.amount).toString()}
                          size={20}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {execute_data && (
                  <>
                    <div className="sm:col-span-4 text-lg font-bold">
                      Execute Data
                    </div>
                    <div className="sm:col-span-4 flex items-start">
                      <div className="w-full bg-slate-100 dark:bg-slate-900 break-all rounded-lg text-slate-400 dark:text-slate-600 text-xs lg:text-sm mr-2 p-4">
                        {execute_data}
                      </div>
                      <div className="mt-4">
                        <Copy
                          value={execute_data}
                          size={20}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </> :
          <ProgressBar
            borderColor={loader_color(theme)}
            width="36"
            height="36"
          />
      }
    </div>
  )
}