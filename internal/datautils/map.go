package datautils

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/hatchet-dev/hatchet/internal/validator"
	"github.com/hatchet-dev/hatchet/pkg/errors"
	"github.com/mitchellh/mapstructure"
	"github.com/rs/zerolog"
	"github.com/steebchen/prisma-client-go/runtime/types"
)

func ToJSONMap(data interface{}) (map[string]interface{}, error) {
	// Marshal and unmarshal to/from JSON to get a map[string]interface{}. There are probably better
	// or more efficient ways to do this, but this is the easiest way for now.
	jsonBytes, err := json.Marshal(data)

	if err != nil {
		return nil, err
	}

	return jsonBytesToMap(jsonBytes)
}

func jsonBytesToMap(jsonBytes []byte) (map[string]interface{}, error) {
	dataMap := map[string]interface{}{}

	err := json.Unmarshal(jsonBytes, &dataMap)

	if err != nil {
		return nil, err
	}

	return dataMap, nil
}

func FromJSONType(data *types.JSON, target interface{}) error {
	if data == nil {
		return nil
	}

	dataBytes, err := data.MarshalJSON()

	if err != nil {
		return fmt.Errorf("failed to marshal json: %w", err)
	}

	unquoted, err := strconv.Unquote(string(dataBytes))

	if err != nil {
		return fmt.Errorf("failed to unquote json: %w", err)
	}

	if err := json.Unmarshal([]byte(unquoted), &target); err != nil {
		return fmt.Errorf("failed to unmarshal json: %w", err)
	}

	return nil
}

func ToJSONType(data interface{}) (*types.JSON, error) {
	if data == nil {
		return nil, nil
	}

	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	resp := types.JSON(jsonBytes)

	return &resp, nil
}

type DataDecoderValidator interface {
	DecodeAndValidate(input, target interface{}) error
}

type DefaultDataDecoderValidator struct {
	logger    *zerolog.Logger
	alerter   errors.Alerter
	validator validator.Validator
	tagName   string
}

type DataDecoderValidatorOpt func(*DataDecoderValidatorOpts)

type DataDecoderValidatorOpts struct {
	logger    *zerolog.Logger
	alerter   errors.Alerter
	validator validator.Validator
	tagName   string
}

func defaultDataDecoderValidatorOpts() *DataDecoderValidatorOpts {
	zl := zerolog.New(os.Stderr)

	return &DataDecoderValidatorOpts{
		logger:    &zl,
		alerter:   nil,
		validator: validator.NewDefaultValidator(),
		tagName:   "json",
	}
}

func WithValidator(v validator.Validator) DataDecoderValidatorOpt {
	return func(opts *DataDecoderValidatorOpts) {
		opts.validator = v
	}
}

func WithLogger(l *zerolog.Logger) DataDecoderValidatorOpt {
	return func(opts *DataDecoderValidatorOpts) {
		opts.logger = l
	}
}

func WithAlerter(a errors.Alerter) DataDecoderValidatorOpt {
	return func(opts *DataDecoderValidatorOpts) {
		opts.alerter = a
	}
}

func WithTagName(t string) DataDecoderValidatorOpt {
	return func(opts *DataDecoderValidatorOpts) {
		opts.tagName = t
	}
}

func NewDataDecoderValidator(
	f ...DataDecoderValidatorOpt,
) DataDecoderValidator {
	opts := defaultDataDecoderValidatorOpts()

	for _, opt := range f {
		opt(opts)
	}

	return &DefaultDataDecoderValidator{opts.logger, opts.alerter, opts.validator, opts.tagName}
}

func (j *DefaultDataDecoderValidator) DecodeAndValidate(input, target interface{}) error {
	if input == nil {
		return nil
	}

	if target == nil {
		return fmt.Errorf("target cannot be nil")
	}

	var requestErr error

	config := &mapstructure.DecoderConfig{
		Result:  target,
		TagName: j.tagName,
	}

	decoder, err := mapstructure.NewDecoder(config)
	if err != nil {
		return err
	}

	if err := decoder.Decode(input); err != nil {
		return err
	}

	// validate the request object
	if requestErr = j.validator.Validate(target); requestErr != nil {
		return requestErr
	}

	return nil
}
